import Anthropic from "@anthropic-ai/sdk";
import type { RawVideo, YouTubeChannel, ChannelSummary, VideoAnalytics, CadenceAnalysis, TrajectoryAnalysis } from "@/types";
import { scoreVideos, buildSummary, computeCadenceAnalysis, computeTrajectoryAnalysis } from "@/lib/process";

// Light-analysis tool: analyses ANY channel from PUBLIC data via the YouTube Data
// API key (no OAuth / no user token). Reuses the public-safe subset of the existing
// analysis helpers in lib/process.ts (packaging patterns, cadence, trajectory,
// outliers) — none of which need private analytics — plus a single Claude synthesis.

const YT = "https://www.googleapis.com/youtube/v3";
const MAX_VIDEOS = 60;
const COMMENT_VIDEO_COUNT = 5;

function apiKey(): string {
  const key = process.env.YOUTUBE_API_KEY;
  if (!key) throw new Error("YOUTUBE_API_KEY is not configured");
  return key;
}

async function ytPublic<T>(path: string, params: Record<string, string>): Promise<T> {
  const qs = new URLSearchParams({ ...params, key: apiKey() });
  const res = await fetch(`${YT}/${path}?${qs}`);
  const data = (await res.json()) as T & { error?: { message?: string } };
  if (!res.ok) throw new Error(data.error?.message ?? `YouTube API error ${res.status}`);
  return data;
}

interface IdListResponse { items?: { id?: string }[] }
interface SearchResponse { items?: { id?: { channelId?: string }; snippet?: { channelId?: string } }[] }

// Resolve a handle, custom URL, /channel/ID URL, or bare name to a channelId.
export async function resolveChannelId(input: string): Promise<string> {
  const raw = input.trim();

  // Direct channel URL or raw UC… id
  const chMatch = raw.match(/channel\/(UC[\w-]+)/);
  if (chMatch) return chMatch[1];
  if (/^UC[\w-]{20,}$/.test(raw)) return raw;

  // @handle (from a URL or bare)
  let handle: string | null = null;
  const atUrl = raw.match(/youtube\.com\/@([\w.-]+)/i);
  if (atUrl) handle = atUrl[1];
  else if (raw.startsWith("@")) handle = raw.slice(1);
  if (handle) {
    const data = await ytPublic<IdListResponse>("channels", { part: "id", forHandle: `@${handle}` });
    const id = data.items?.[0]?.id;
    if (id) return id;
  }

  // /user/NAME (legacy username)
  const userUrl = raw.match(/youtube\.com\/user\/([\w.-]+)/i);
  if (userUrl) {
    const data = await ytPublic<IdListResponse>("channels", { part: "id", forUsername: userUrl[1] });
    const id = data.items?.[0]?.id;
    if (id) return id;
  }

  // /c/NAME or a bare name → search
  const cUrl = raw.match(/youtube\.com\/c\/([\w.-]+)/i);
  const query = cUrl?.[1] ?? handle ?? raw;
  const search = await ytPublic<SearchResponse>("search", { part: "snippet", type: "channel", q: query, maxResults: "1" });
  const found = search.items?.[0]?.id?.channelId ?? search.items?.[0]?.snippet?.channelId;
  if (found) return found;

  throw new Error(`Could not resolve a channel from "${input}"`);
}

interface ChannelResponse {
  items?: {
    snippet?: { title?: string; customUrl?: string; thumbnails?: { default?: { url: string }; medium?: { url: string } } };
    statistics?: { subscriberCount?: string; viewCount?: string; videoCount?: string };
    contentDetails?: { relatedPlaylists?: { uploads?: string } };
  }[];
}

async function fetchPublicChannel(channelId: string): Promise<{ channel: YouTubeChannel; uploadsPlaylistId: string }> {
  const data = await ytPublic<ChannelResponse>("channels", { part: "snippet,contentDetails,statistics", id: channelId });
  const item = data.items?.[0];
  if (!item) throw new Error("Channel not found");
  return {
    channel: {
      id: channelId,
      title: item.snippet?.title ?? "",
      handle: (item.snippet?.customUrl ?? "").replace(/^@/, ""),
      thumbnail: item.snippet?.thumbnails?.medium?.url ?? item.snippet?.thumbnails?.default?.url ?? "",
      subscriberCount: parseInt(item.statistics?.subscriberCount ?? "0"),
      totalViews: parseInt(item.statistics?.viewCount ?? "0"),
      videoCount: parseInt(item.statistics?.videoCount ?? "0"),
    },
    uploadsPlaylistId: item.contentDetails?.relatedPlaylists?.uploads ?? "",
  };
}

interface PlaylistResponse { items?: { contentDetails?: { videoId?: string } }[]; nextPageToken?: string }

async function recentVideoIds(uploadsPlaylistId: string, maxVideos: number): Promise<string[]> {
  const ids: string[] = [];
  let pageToken: string | undefined;
  do {
    const params: Record<string, string> = { part: "contentDetails", playlistId: uploadsPlaylistId, maxResults: "50" };
    if (pageToken) params.pageToken = pageToken;
    const data = await ytPublic<PlaylistResponse>("playlistItems", params);
    for (const it of data.items ?? []) {
      const id = it.contentDetails?.videoId;
      if (id) ids.push(id);
    }
    pageToken = data.nextPageToken;
  } while (pageToken && ids.length < maxVideos);
  return ids.slice(0, maxVideos);
}

interface VideosResponse { items?: RawVideo[] }

async function videoDetails(ids: string[]): Promise<RawVideo[]> {
  const out: RawVideo[] = [];
  for (let i = 0; i < ids.length; i += 50) {
    const batch = ids.slice(i, i + 50);
    const data = await ytPublic<VideosResponse>("videos", { part: "snippet,statistics,contentDetails", id: batch.join(",") });
    out.push(...(data.items ?? []));
  }
  return out;
}

interface CommentsResponse {
  items?: { snippet?: { topLevelComment?: { snippet?: { textDisplay?: string } } } }[];
}

async function topComments(videoId: string): Promise<string[]> {
  try {
    const data = await ytPublic<CommentsResponse>("commentThreads", { part: "snippet", videoId, maxResults: "20", order: "relevance" });
    return (data.items ?? [])
      .map((it) => it.snippet?.topLevelComment?.snippet?.textDisplay ?? "")
      .filter((t): t is string => t.length > 0);
  } catch {
    return [];
  }
}

export interface PublicAnalysisResult {
  channel: { title: string; handle: string; subscriberCount: number; thumbnail: string; videoCount: number };
  videosAnalysed: number;
  dateRange: { from: string; to: string };
  medianViews: number;
  topVideos: { title: string; views: number; publishedAt: string }[];
  signals: string[];
  findings: string[];
  nextVideoAngle: string;
}

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

async function synthesize(
  summary: ChannelSummary,
  cadence: CadenceAnalysis,
  trajectory: TrajectoryAnalysis,
): Promise<{ findings: string[]; nextVideoAngle: string }> {
  const sp = summary.successPatterns;
  const all = summary.allVideos ?? [];
  const topVids = all.slice(0, 5).map((v, i) => `${i + 1}. "${v.title}" — ${v.viewCount.toLocaleString()} views`).join("\n");
  const tldr = (sp?.tldr ?? []).map((b) => `- ${b.text} (${b.evidence})`).join("\n") || "- (no strong packaging pattern detected)";
  const outliers = summary.outliers.map((v) => `"${v.title}" (${v.viewCount.toLocaleString()} views)`).join("; ") || "none";
  const comments = summary.topPerformers.flatMap((v) => v.topComments ?? []).slice(0, 40).map((c) => `- ${c.slice(0, 160)}`).join("\n") || "(no comments available)";

  const prompt = `You are analysing a YouTube channel from PUBLIC data only, to prepare a sharp cold-outreach hook. Be specific and grounded ONLY in the data below — no fluff, no generic advice.

CHANNEL: ${summary.channel.title} (${summary.channel.subscriberCount.toLocaleString()} subscribers)
Videos analysed: ${summary.totalVideosAnalysed} most recent | ${summary.dateRange.from.slice(0, 10)} → ${summary.dateRange.to.slice(0, 10)}
Median views/video: ${(sp?.channelMedianViews ?? 0).toLocaleString()}

TOP VIDEOS BY VIEWS:
${topVids}

PACKAGING / TITLE PATTERNS (computed from their data):
${tldr}

VIEW OUTLIERS (breakout videos): ${outliers}

CADENCE: strongest day ${cadence.bestDay ?? "n/a"}. ${cadence.frequencyInsight}
TRAJECTORY: ${trajectory.verdictText}

TOP COMMENTS (audience voice):
${comments}

Return ONLY a JSON object, no markdown:
{"findings":["3 to 5 sharp findings a creator would find impressive and true — each tied to a concrete number, video, or pattern above"],"nextVideoAngle":"one specific next-video concept (a concrete title plus one line on why it fits what already works for THIS channel)"}`;

  const msg = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 1200,
    messages: [{ role: "user", content: prompt }],
  });
  const block = msg.content[0];
  const raw = block?.type === "text" ? block.text : "";
  const text = raw.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
  const parsed = JSON.parse(text) as { findings?: unknown; nextVideoAngle?: unknown };
  const findings = Array.isArray(parsed.findings) ? parsed.findings.map(String).slice(0, 5) : [];
  return { findings, nextVideoAngle: typeof parsed.nextVideoAngle === "string" ? parsed.nextVideoAngle : "" };
}

export async function analyzePublicChannel(input: string): Promise<PublicAnalysisResult> {
  const channelId = await resolveChannelId(input);
  const { channel, uploadsPlaylistId } = await fetchPublicChannel(channelId);
  if (!uploadsPlaylistId) throw new Error("Channel has no accessible public uploads");

  const ids = await recentVideoIds(uploadsPlaylistId, MAX_VIDEOS);
  if (!ids.length) throw new Error("No public videos found for this channel");
  const rawVideos = await videoDetails(ids);
  if (!rawVideos.length) throw new Error("Could not load public video details");

  // No private analytics available — score from public stats only (empty analytics map).
  const scored = scoreVideos(rawVideos, new Map<string, VideoAnalytics>());

  const commentsMap = new Map<string, { text: string; author: string }[]>();
  await Promise.all(
    scored.scored.slice(0, COMMENT_VIDEO_COUNT).map(async (v) => {
      const texts = await topComments(v.id);
      commentsMap.set(v.id, texts.map((t) => ({ text: t, author: "" })));
    }),
  );

  const summary = buildSummary(scored, commentsMap, channel);
  const allVideos = summary.allVideos ?? scored.scored;
  const cadence = computeCadenceAnalysis(allVideos);
  const trajectory = computeTrajectoryAnalysis(allVideos);

  const signals: string[] = [];
  for (const b of summary.successPatterns?.tldr ?? []) signals.push(`${b.text} — ${b.evidence}`);
  if (cadence.frequencyInsight) signals.push(cadence.frequencyInsight);
  if (trajectory.verdictText) signals.push(trajectory.verdictText);

  const { findings, nextVideoAngle } = await synthesize(summary, cadence, trajectory);

  return {
    channel: {
      title: channel.title,
      handle: channel.handle,
      subscriberCount: channel.subscriberCount,
      thumbnail: channel.thumbnail,
      videoCount: channel.videoCount,
    },
    videosAnalysed: summary.totalVideosAnalysed,
    dateRange: summary.dateRange,
    medianViews: summary.successPatterns?.channelMedianViews ?? 0,
    topVideos: allVideos.slice(0, 5).map((v) => ({ title: v.title, views: v.viewCount, publishedAt: v.publishedAt })),
    signals,
    findings,
    nextVideoAngle,
  };
}
