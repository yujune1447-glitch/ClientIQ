import type { NicheSummary } from "@/types";

const YT = "https://www.googleapis.com/youtube/v3";

const STOP_WORDS = new Set([
  "the","a","an","and","or","but","in","on","at","to","for","of","with","by",
  "from","is","are","was","were","be","been","have","has","had","do","does",
  "did","will","would","could","should","that","this","these","those","i","you",
  "he","she","it","we","they","me","him","her","us","them","my","your","his",
  "its","our","their","what","how","why","when","who","which","just","get",
  "your","more","can","not","all","one","about","up","out","they","if","so",
]);

function parseDuration(iso: string): number {
  const m = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!m) return 0;
  return (parseInt(m[1] ?? "0") * 3600) + (parseInt(m[2] ?? "0") * 60) + parseInt(m[3] ?? "0");
}

function percentile(sorted: number[], p: number): number {
  return sorted[Math.floor(sorted.length * p)] ?? 0;
}

function extractFormats(titles: string[]): string[] {
  const formats: string[] = [];
  const check = (re: RegExp, label: string) => {
    const n = titles.filter((t) => re.test(t)).length;
    if (n >= 3) formats.push(`${label} (${n} of ${titles.length} top videos)`);
  };
  check(/^\d+\s|\b\d+\s+(ways|tips|things|steps|reasons|secrets|mistakes|rules)\b/i, "Number lists");
  check(/^how to/i, '"How to" format');
  check(/^why\s/i, '"Why..." format');
  check(/\b(i |my |i\'ve |i\'m )/i, "Personal / I-story format");
  check(/\?$/, "Question format");
  check(/^(the truth|the real|honest|brutal)/i, "Truth / honest format");
  return formats;
}

function extractPowerWords(titles: string[]): string[] {
  const freq: Record<string, number> = {};
  for (const title of titles) {
    for (const word of title.toLowerCase().replace(/[^a-z0-9\s]/g, "").split(/\s+/)) {
      if (word.length > 3 && !STOP_WORDS.has(word)) {
        freq[word] = (freq[word] ?? 0) + 1;
      }
    }
  }
  return Object.entries(freq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)
    .map(([w]) => w);
}

function extractHookPatterns(descriptions: string[]): string[] {
  const patterns: string[] = [];
  const top = descriptions.slice(0, 20);
  const withQ = top.filter((d) => d.trimStart().endsWith("?") || d.includes("?")).length;
  if (withQ >= 4) patterns.push(`Open with a question (${withQ}/20 top videos)`);
  const withStat = top.filter((d) => /^\d/.test(d.trim())).length;
  if (withStat >= 3) patterns.push(`Open with a statistic or number (${withStat}/20 top videos)`);
  const withStory = top.filter((d) => /\bi (was|had|went|tried|thought)\b/i.test(d)).length;
  if (withStory >= 3) patterns.push(`Open with a personal story (${withStory}/20 top videos)`);
  return patterns;
}

export async function searchNicheVideoIds(niche: string, accessToken: string): Promise<string[]> {
  const params = new URLSearchParams({
    q: niche,
    type: "video",
    order: "viewCount",
    maxResults: "50",
    part: "id",
    relevanceLanguage: "en",
  });
  const res = await fetch(`${YT}/search?${params}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error?.message ?? "Niche search failed");
  return (data.items ?? []).map((i: { id: { videoId: string } }) => i.id.videoId).filter(Boolean);
}

export async function getNicheVideoDetails(ids: string[], accessToken: string): Promise<unknown[]> {
  if (!ids.length) return [];
  const params = new URLSearchParams({ id: ids.join(","), part: "snippet,statistics,contentDetails" });
  const res = await fetch(`${YT}/videos?${params}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error?.message ?? "Niche video details failed");
  return data.items ?? [];
}

export function processNicheData(videos: unknown[], niche: string): NicheSummary {
  const items = (videos as {
    statistics?: { viewCount?: string };
    contentDetails?: { duration?: string };
    snippet?: { title?: string; description?: string };
  }[]).filter((v) => v.statistics?.viewCount);

  const sorted = [...items].sort(
    (a, b) => parseInt(b.statistics!.viewCount!) - parseInt(a.statistics!.viewCount!)
  );

  const views = sorted.map((v) => parseInt(v.statistics!.viewCount!));
  const durations = sorted.map((v) => parseDuration(v.contentDetails?.duration ?? "PT0S"));
  const titles = sorted.map((v) => v.snippet?.title ?? "");
  const descriptions = sorted.map((v) => (v.snippet?.description ?? "").slice(0, 300));

  const sortedViews = [...views].sort((a, b) => a - b);
  const sortedDurations = [...durations].filter((d) => d > 0).sort((a, b) => a - b);

  const topQ = sorted.slice(0, Math.ceil(sorted.length / 4));
  const topQDurations = topQ.map((v) => parseDuration(v.contentDetails?.duration ?? "PT0S")).filter((d) => d > 0);

  return {
    niche,
    videosAnalysed: sorted.length,
    titlePatterns: {
      commonFormats: extractFormats(titles),
      powerWords: extractPowerWords(titles),
      avgTitleLength: Math.round(titles.reduce((s, t) => s + t.length, 0) / (titles.length || 1)),
      topTitles: titles.slice(0, 5),
    },
    lengthInsights: {
      medianDurationSeconds: percentile(sortedDurations, 0.5),
      topPerformerRangeSeconds: [
        topQDurations.length ? Math.min(...topQDurations) : 0,
        topQDurations.length ? Math.max(...topQDurations) : 0,
      ],
      recommendation: `Top "${niche}" videos run ${Math.round(percentile(sortedDurations, 0.5) / 60)} min on average; top quartile ranges ${Math.round((topQDurations.length ? Math.min(...topQDurations) : 0) / 60)}–${Math.round((topQDurations.length ? Math.max(...topQDurations) : 0) / 60)} min`,
    },
    viewBenchmarks: {
      median: percentile(sortedViews, 0.5),
      topQuartile: percentile(sortedViews, 0.75),
      viral: percentile(sortedViews, 0.9),
    },
    topicClusters: extractPowerWords(titles).slice(0, 10),
    hookPatterns: extractHookPatterns(descriptions),
    topPerformers: sorted.slice(0, 10).map((v) => ({
      title: v.snippet?.title ?? "",
      views: parseInt(v.statistics!.viewCount!),
      durationSeconds: parseDuration(v.contentDetails?.duration ?? "PT0S"),
      description: (v.snippet?.description ?? "").slice(0, 200),
    })),
  };
}
