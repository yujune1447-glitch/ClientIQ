import type {
  RawVideo, VideoAnalytics, VideoWithScore, ChannelSummary, YouTubeChannel,
  SuccessPatterns, TitleCategoryStat, TitleMechanicStat, DurationBucketStat, TldrBullet,
  HookEntry, HookAnalysis,
} from "@/types";

interface ScoredResult {
  scored: VideoWithScore[];
  averages: ChannelSummary["averages"];
  outliers: VideoWithScore[];
  dateRange: { from: string; to: string };
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function median(values: number[]): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function avgViews(videos: VideoWithScore[]): number {
  if (!videos.length) return 0;
  return videos.reduce((s, v) => s + v.viewCount, 0) / videos.length;
}

function parseDurSec(iso: string): number {
  const m = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!m) return 0;
  return (parseInt(m[1] ?? "0") * 3600) + (parseInt(m[2] ?? "0") * 60) + parseInt(m[3] ?? "0");
}

const TITLE_CATEGORY_DEFS: Array<{
  key: string; name: string; test: (t: string) => boolean;
}> = [
  {
    key: "reassurance",
    name: "Reassurance / Permission-giving",
    test: (t) => /\b(you don'?t have to|it'?s (ok|okay)\b|you'?re allowed|give yourself|be gentle|you are enough|take a (deep )?breath|no pressure|let yourself|not your fault|you don'?t need to|stop (feeling|worrying|pushing)|allow yourself)\b/i.test(t),
  },
  {
    key: "timing",
    name: "Timing / Destiny framing",
    test: (t) => /\b(when the time|when you need|meant to (find|see|hear|watch)|right time|divine timing|trust the process|found this for a reason|not a coincidence|exactly where you|where you'?re? meant)\b/i.test(t),
  },
  {
    key: "personal-journey",
    name: "Personal journey / First-person",
    test: (t) => /^(how i|why i|what i|i tried|i quit|i spent|i made|i built|i only|i stopped|i started|i learned|i realized|i chose|i left|i moved|i went|i found|i lost|i used|i switched)\b/i.test(t),
  },
  {
    key: "question",
    name: "Question / Curiosity gap",
    test: (t) => /\?\s*$/.test(t.trim()),
  },
  {
    key: "list",
    name: "List / Countdown",
    test: (t) => /^\d+\s+\w/i.test(t),
  },
];

const DURATION_BUCKETS: Array<{ label: string; minSec: number; maxSec: number }> = [
  { label: "Under 3 min",  minSec: 0,    maxSec: 179  },
  { label: "3 – 7 min",    minSec: 180,  maxSec: 419  },
  { label: "7 – 12 min",   minSec: 420,  maxSec: 719  },
  { label: "12 – 20 min",  minSec: 720,  maxSec: 1199 },
  { label: "Over 20 min",  minSec: 1200, maxSec: Infinity },
];

function fmtMultiplier(x: number): string {
  return `${x.toFixed(1)}×`;
}

function fmt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

export function computeSuccessPatterns(
  scored: VideoWithScore[],
  topPerformers: VideoWithScore[],
): SuccessPatterns {
  const total = scored.length;
  const channelMedianViews = median(scored.map((v) => v.viewCount));

  // ── 1. Title categories ───────────────────────────────────────────────────
  const titleCategories: TitleCategoryStat[] = TITLE_CATEGORY_DEFS.map(({ key, name, test }) => {
    const matching = scored.filter((v) => test(v.title));
    const n = matching.length;
    const med = median(matching.map((v) => v.viewCount));
    return {
      key,
      name,
      n,
      medianViews: Math.round(med),
      viewMultiplier: channelMedianViews > 0 ? Math.round((med / channelMedianViews) * 10) / 10 : 0,
      lowConfidence: n < 3,
      smallSample: n < 10,
      exampleTitles: matching.slice(0, 5).map((v) => v.title),
    };
  }).filter((c) => c.n > 0);

  // ── 2. Title mechanics ────────────────────────────────────────────────────
  const mechanicDefs: Array<{ label: string; withPhrase: string; test: (t: string) => boolean }> = [
    { label: "Contains a number",      withPhrase: "containing a number",    test: (t) => /\d/.test(t) },
    { label: 'Includes "you"/"your"',  withPhrase: "including 'you'/'your'", test: (t) => /\byou\b|\byour\b/i.test(t) },
    { label: "Ends with a question",   withPhrase: "ending with a question", test: (t) => /\?\s*$/.test(t.trim()) },
    { label: "Short title (≤6 words)", withPhrase: "short (≤6 words)",       test: (t) => t.trim().split(/\s+/).length <= 6 },
    { label: "Long title (≥12 words)", withPhrase: "long (≥12 words)",       test: (t) => t.trim().split(/\s+/).length >= 12 },
  ];

  const titleMechanics: TitleMechanicStat[] = mechanicDefs.map(({ label, withPhrase, test }) => {
    const withVids = scored.filter((v) => test(v.title));
    const withoutVids = scored.filter((v) => !test(v.title));
    const medWith = median(withVids.map((v) => v.viewCount));
    const medWithout = median(withoutVids.map((v) => v.viewCount));
    return {
      label,
      withPhrase,
      nWith: withVids.length,
      nWithout: withoutVids.length,
      medianViewsWith: Math.round(medWith),
      medianViewsWithout: Math.round(medWithout),
      multiplier: medWithout > 0 ? Math.round((medWith / medWithout) * 10) / 10 : 0,
      lowConfidence: withVids.length < 3,
      smallSample: withVids.length < 10,
    };
  });

  // ── 3. Duration buckets ───────────────────────────────────────────────────
  const topIds = new Set(topPerformers.map((v) => v.id));
  const durationBuckets: DurationBucketStat[] = DURATION_BUCKETS.map(({ label, minSec, maxSec }) => {
    const bucket = scored.filter((v) => {
      const s = parseDurSec(v.duration);
      return s >= minSec && s <= maxSec;
    });
    const med = median(bucket.map((v) => v.viewCount));
    return {
      label,
      minSec,
      maxSec,
      n: bucket.length,
      medianViews: Math.round(med),
      viewMultiplier: channelMedianViews > 0 ? Math.round((med / channelMedianViews) * 10) / 10 : 0,
      topPerformerCount: bucket.filter((v) => topIds.has(v.id)).length,
      lowConfidence: bucket.length < 3,
    };
  }).filter((b) => b.n > 0);

  // ── 4. Posting timing ─────────────────────────────────────────────────────
  const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const dayGroups = new Map<number, VideoWithScore[]>();
  const slotGroups = new Map<string, VideoWithScore[]>();
  const SLOTS: Array<{ label: string; start: number; end: number }> = [
    { label: "Morning (6–12)",   start: 6,  end: 12 },
    { label: "Afternoon (12–18)", start: 12, end: 18 },
    { label: "Evening (18–24)",  start: 18, end: 24 },
    { label: "Night (0–6)",      start: 0,  end: 6  },
  ];

  for (const v of scored) {
    const d = new Date(v.publishedAt);
    const day = d.getUTCDay();
    const hour = d.getUTCHours();
    if (!dayGroups.has(day)) dayGroups.set(day, []);
    dayGroups.get(day)!.push(v);
    const slot = SLOTS.find((s) => hour >= s.start && hour < s.end)?.label ?? "Night (0–6)";
    if (!slotGroups.has(slot)) slotGroups.set(slot, []);
    slotGroups.get(slot)!.push(v);
  }

  const byDayOfWeek = DAYS.map((day, i) => {
    const group = dayGroups.get(i) ?? [];
    return { day, n: group.length, avgViews: Math.round(avgViews(group)) };
  }).filter((d) => d.n > 0);

  const byTimeOfDay = SLOTS.map(({ label }) => {
    const group = slotGroups.get(label) ?? [];
    return { slot: label, n: group.length, avgViews: Math.round(avgViews(group)) };
  }).filter((s) => s.n > 0);

  const postingTiming = {
    lowConfidence: total < 20,
    byDayOfWeek,
    byTimeOfDay,
  };

  // ── 5. TL;DR bullets ─────────────────────────────────────────────────────
  const tldr: TldrBullet[] = [];

  // Best title category
  const bestCat = [...titleCategories]
    .filter((c) => !c.lowConfidence && !c.smallSample)
    .sort((a, b) => b.viewMultiplier - a.viewMultiplier)[0];
  if (bestCat && bestCat.viewMultiplier >= 1.2) {
    tldr.push({
      text: `${bestCat.name} titles get ${fmtMultiplier(bestCat.viewMultiplier)} the channel median views`,
      evidence: `n=${bestCat.n}, ${fmt(bestCat.medianViews)} median views`,
    });
  }

  // Best duration bucket
  const bestBucket = [...durationBuckets]
    .filter((b) => !b.lowConfidence)
    .sort((a, b) => b.viewMultiplier - a.viewMultiplier)[0];
  if (bestBucket && bestBucket.viewMultiplier >= 1.2) {
    tldr.push({
      text: `${bestBucket.label} videos are your sweet spot — ${fmtMultiplier(bestBucket.viewMultiplier)} median views`,
      evidence: `n=${bestBucket.n}, ${fmt(bestBucket.medianViews)} median views`,
    });
  }

  // Best title mechanic
  const bestMechanic = [...titleMechanics]
    .filter((m) => !m.lowConfidence && !m.smallSample && m.multiplier >= 1.1)
    .sort((a, b) => b.multiplier - a.multiplier)[0];
  if (bestMechanic) {
    const pct = Math.round((bestMechanic.multiplier - 1) * 100);
    tldr.push({
      text: `Titles ${bestMechanic.withPhrase} get ${pct}% more median views`,
      evidence: `${bestMechanic.nWith} with (${fmt(bestMechanic.medianViewsWith)}) vs ${bestMechanic.nWithout} without (${fmt(bestMechanic.medianViewsWithout)})`,
    });
  }

  // Best posting day
  if (!postingTiming.lowConfidence) {
    const bestDay = [...byDayOfWeek].filter((d) => d.n >= 5).sort((a, b) => b.avgViews - a.avgViews)[0];
    if (bestDay) {
      tldr.push({
        text: `${bestDay.day} is your strongest publishing day`,
        evidence: `n=${bestDay.n}, ${fmt(bestDay.avgViews)} avg views`,
      });
    }
  }

  return {
    channelMedianViews,
    totalVideos: total,
    tldr,
    titleCategories,
    titleMechanics,
    durationBuckets,
    postingTiming,
  };
}

export function scoreVideos(
  rawVideos: RawVideo[],
  analyticsMap: Map<string, VideoAnalytics>
): ScoredResult {
  const videos: VideoWithScore[] = rawVideos.map((raw) => {
    const a = analyticsMap.get(raw.id);
    return {
      id: raw.id,
      title: raw.snippet.title,
      publishedAt: raw.snippet.publishedAt,
      thumbnail: raw.snippet.thumbnails.medium?.url ?? raw.snippet.thumbnails.default?.url ?? "",
      viewCount: parseInt(raw.statistics.viewCount ?? "0"),
      likeCount: parseInt(raw.statistics.likeCount ?? "0"),
      commentCount: parseInt(raw.statistics.commentCount ?? "0"),
      duration: raw.contentDetails.duration,
      ctr: a?.ctr ?? 0,
      averageViewDuration: a?.averageViewDuration ?? 0,
      averageViewPercentage: a?.averageViewPercentage ?? 0,
      impressions: a?.impressions ?? 0,
      performanceScore: 0,
      viewsVsAverage: 0,
    };
  });

  const n = videos.length;

  const avgViews = videos.reduce((s, v) => s + v.viewCount, 0) / n;
  const avgLikes = videos.reduce((s, v) => s + v.likeCount, 0) / n;
  const avgComments = videos.reduce((s, v) => s + v.commentCount, 0) / n;

  const withRetention = videos.filter((v) => (v.averageViewPercentage ?? 0) > 0);
  const avgRetention = withRetention.length
    ? withRetention.reduce((s, v) => s + (v.averageViewPercentage ?? 0), 0) / withRetention.length
    : 0;

  for (const v of videos) {
    v.viewsVsAverage = avgViews > 0 ? Math.round((v.viewCount / avgViews - 1) * 100) : 0;
  }

  const sorted = [...videos].sort((a, b) => b.viewCount - a.viewCount);

  const variance = videos.reduce((s, v) => s + Math.pow(v.viewCount - avgViews, 2), 0) / n;
  const stdDev = Math.sqrt(variance);
  const outliers = videos
    .filter((v) => v.viewCount > avgViews + 2 * stdDev)
    .sort((a, b) => b.viewCount - a.viewCount)
    .slice(0, 5);

  const dates = videos.map((v) => v.publishedAt).sort();

  return {
    scored: sorted,
    averages: {
      views: Math.round(avgViews),
      likes: Math.round(avgLikes),
      comments: Math.round(avgComments),
      ctr: 0,
      retentionRate: Math.round(avgRetention * 100) / 100,
    },
    outliers,
    dateRange: { from: dates[0], to: dates[dates.length - 1] },
  };
}

export function computeHookAnalysis(
  topPerformers: VideoWithScore[],
  bottomPerformers: VideoWithScore[],
  captionData: Map<string, { status: string; text: string | null }>,
): HookAnalysis {
  function categorize(text: string): HookEntry["hookType"] {
    const t = text.trim();
    if (/^(you |if you |are you |do you |have you |picture |imagine )/i.test(t)) return "direct-address";
    if (/\?/.test(t) || /^(what if |why |how |when |can you )/i.test(t)) return "question";
    if (/^(most |nobody |stop |forget |the truth|warning|this is why|what nobody|the problem|here'?s why)/i.test(t)) return "bold-claim";
    if (/^(i |my |our |we |last |today i |so i |it was |there was )/i.test(t)) return "cold-open-story";
    return "other";
  }

  function toEntry(v: VideoWithScore): HookEntry | null {
    const cap = captionData.get(v.id);
    if (!cap || cap.status !== "fetched" || !cap.text) return null;
    const snippet = cap.text.slice(0, 150).trim();
    if (!snippet) return null;
    return { videoId: v.id, title: v.title, views: v.viewCount, hookType: categorize(snippet), hookText: snippet };
  }

  const all = [...topPerformers, ...bottomPerformers];
  const withCaptions = all.filter((v) => captionData.get(v.id)?.status === "fetched").length;
  const captionCoverage = all.length > 0 ? withCaptions / all.length : 0;

  const topHooks = topPerformers.map(toEntry).filter((e): e is HookEntry => e !== null);
  const bottomHooks = bottomPerformers.map(toEntry).filter((e): e is HookEntry => e !== null);

  return { topHooks, bottomHooks, captionCoverage, hasEnoughData: topHooks.length >= 3 };
}

export function buildSummary(
  result: ScoredResult,
  commentsMap: Map<string, { text: string; author: string }[]>,
  channel: YouTubeChannel
): ChannelSummary {
  const { scored, averages, outliers, dateRange } = result;

  const withComments = (v: VideoWithScore): VideoWithScore => {
    const comments = commentsMap.get(v.id) ?? [];
    return { ...v, topComments: comments.map((c) => c.text), topCommentAuthors: comments.map((c) => c.author) };
  };

  const authorCounts = new Map<string, number>();
  const attach = (v: VideoWithScore) => {
    const comments = commentsMap.get(v.id) ?? [];
    for (const c of comments) {
      if (c.author && c.author !== "Unknown") {
        authorCounts.set(c.author, (authorCounts.get(c.author) ?? 0) + 1);
      }
    }
    return { ...v, topComments: comments.map((c) => c.text), topCommentAuthors: comments.map((c) => c.author) };
  };

  const topPerformers = scored.slice(0, 10).map(attach);
  const bottomPerformers = scored.slice(-10).reverse().map(attach);

  const recentVideos = [...scored]
    .sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime())
    .slice(0, 60)
    .map(withComments);

  const topCommenters = Array.from(authorCounts.entries())
    .filter(([, count]) => count >= 2)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 10)
    .map(([author, count]) => ({ author, count }));

  const successPatterns = computeSuccessPatterns(scored, topPerformers);

  return {
    channel,
    averages,
    topPerformers,
    bottomPerformers,
    outliers,
    recentVideos,
    totalVideosAnalysed: scored.length,
    dateRange,
    topCommenters: topCommenters.length > 0 ? topCommenters : undefined,
    successPatterns,
  };
}
