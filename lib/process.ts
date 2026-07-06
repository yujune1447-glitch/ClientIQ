import type {
  RawVideo, VideoAnalytics, VideoWithScore, ChannelSummary, YouTubeChannel,
  SuccessPatterns, TitleCategoryStat, TitleMechanicStat, DurationBucketStat, TldrBullet,
  HookEntry, HookAnalysis, RetentionVideoStat, RetentionAnalysis,
  VideoSubsStat, TrafficSourceBreakdown, GrowthAnalysis,
} from "@/types";

export interface ScoredResult {
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
    return { day, n: group.length, medianViews: Math.round(median(group.map((v) => v.viewCount))) };
  }).filter((d) => d.n > 0);

  const byTimeOfDay = SLOTS.map(({ label }) => {
    const group = slotGroups.get(label) ?? [];
    return { slot: label, n: group.length, medianViews: Math.round(median(group.map((v) => v.viewCount))) };
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
    const bestDay = [...byDayOfWeek].filter((d) => d.n >= 5).sort((a, b) => b.medianViews - a.medianViews)[0];
    if (bestDay) {
      tldr.push({
        text: `${bestDay.day} is your strongest publishing day`,
        evidence: `n=${bestDay.n}, ${fmt(bestDay.medianViews)} median views`,
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

export function computeRetentionAnalysis(
  topPerformers: VideoWithScore[],
  bottomPerformers: VideoWithScore[],
  allScored: VideoWithScore[],
  relativeRetentionMap: Map<string, number | null>,
): RetentionAnalysis {
  const allWithData = allScored.filter((v) => (v.averageViewPercentage ?? 0) > 0);
  const topWithData = topPerformers.filter((v) => (v.averageViewPercentage ?? 0) > 0);
  const botWithData = bottomPerformers.filter((v) => (v.averageViewPercentage ?? 0) > 0);

  const channelMedianRetentionPct = Math.round(median(allWithData.map((v) => v.averageViewPercentage ?? 0)) * 10) / 10;
  const topMedianRetentionPct = Math.round(median(topWithData.map((v) => v.averageViewPercentage ?? 0)) * 10) / 10;
  const bottomMedianRetentionPct = Math.round(median(botWithData.map((v) => v.averageViewPercentage ?? 0)) * 10) / 10;

  const relValues = [...relativeRetentionMap.values()].filter((v): v is number => v !== null);
  const relativeRetentionMedian = relValues.length >= 3 ? Math.round(median(relValues) * 1000) / 1000 : null;

  function toStat(v: VideoWithScore): RetentionVideoStat {
    return {
      videoId: v.id,
      title: v.title,
      views: v.viewCount,
      avgViewPct: Math.round((v.averageViewPercentage ?? 0) * 10) / 10,
      avgViewDuration: Math.round(v.averageViewDuration ?? 0),
      relativeRetention: relativeRetentionMap.get(v.id) ?? null,
    };
  }

  const sorted = [...allWithData].sort((a, b) => (b.averageViewPercentage ?? 0) - (a.averageViewPercentage ?? 0));
  const bestRetainedVid = sorted[0] ?? null;
  const mostViewedVid = allScored[0] ?? null;

  const bestRetainedVideo = bestRetainedVid ? toStat(bestRetainedVid) : null;
  const mostViewedVideo = mostViewedVid ? toStat(mostViewedVid) : null;

  const viewsRetentionDiverge =
    !!(bestRetainedVideo && mostViewedVideo &&
      bestRetainedVideo.videoId !== mostViewedVideo.videoId &&
      bestRetainedVideo.avgViewPct - mostViewedVideo.avgViewPct >= 5);

  return {
    videosWithRetentionData: allWithData.length,
    totalVideosAnalysed: allScored.length,
    channelMedianRetentionPct,
    topMedianRetentionPct,
    bottomMedianRetentionPct,
    relativeRetentionMedian,
    relativeRetentionN: relValues.length,
    bestRetainedVideo,
    mostViewedVideo,
    viewsRetentionDiverge,
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
    allVideos: scored,
    totalVideosAnalysed: scored.length,
    dateRange,
    topCommenters: topCommenters.length > 0 ? topCommenters : undefined,
    successPatterns,
  };
}

const ALGORITHM_SOURCES = new Set(["BROWSE_FEATURES", "SUGGESTED_VIDEOS", "RELATED_VIDEO"]);
const SEARCH_SOURCES = new Set(["YT_SEARCH"]);
const EXTERNAL_SOURCES = new Set(["EXT_URL", "NO_LINK_OTHER"]);
const NOTIFICATION_SOURCES = new Set(["NOTIFICATION", "SUBSCRIBER"]);

function parseTrafficSources(raw: Record<string, number>): TrafficSourceBreakdown {
  let algorithm = 0, search = 0, external = 0, notifications = 0, other = 0;
  for (const [k, v] of Object.entries(raw)) {
    if (ALGORITHM_SOURCES.has(k)) algorithm += v;
    else if (SEARCH_SOURCES.has(k)) search += v;
    else if (EXTERNAL_SOURCES.has(k)) external += v;
    else if (NOTIFICATION_SOURCES.has(k)) notifications += v;
    else other += v;
  }
  const total = algorithm + search + external + notifications + other;
  const pct = (v: number) => total > 0 ? Math.round((v / total) * 100) : 0;
  return {
    algorithm, search, external, notifications, other, total,
    algorithmPct: pct(algorithm),
    searchPct: pct(search),
    externalPct: pct(external),
    notificationsPct: pct(notifications),
    otherPct: pct(other),
  };
}

function mergeTraffic(sources: TrafficSourceBreakdown[]): TrafficSourceBreakdown | null {
  if (!sources.length) return null;
  let algorithm = 0, search = 0, external = 0, notifications = 0, other = 0;
  for (const s of sources) {
    algorithm += s.algorithm; search += s.search; external += s.external;
    notifications += s.notifications; other += s.other;
  }
  const total = algorithm + search + external + notifications + other;
  const pct = (v: number) => total > 0 ? Math.round((v / total) * 100) : 0;
  return {
    algorithm, search, external, notifications, other, total,
    algorithmPct: pct(algorithm), searchPct: pct(search), externalPct: pct(external),
    notificationsPct: pct(notifications), otherPct: pct(other),
  };
}

function buildConversionInsight(topMedian: number, bottomMedian: number, n: number): string {
  if (n < 5) return "";
  let s = `Your top-performing videos gain a median of ${fmt(topMedian)} subscribers each.`;
  if (bottomMedian > 0 && topMedian !== bottomMedian) {
    if (topMedian >= bottomMedian * 1.5) {
      const ratio = Math.round((topMedian / Math.max(bottomMedian, 1)) * 10) / 10;
      s += ` That's ${ratio}× more than your bottom performers (${fmt(bottomMedian)}) — your best content is a subscriber machine, not just a views machine.`;
    } else if (topMedian > bottomMedian) {
      s += ` Your bottom performers pull ${fmt(bottomMedian)} — a narrower gap, so topic and hook quality matter more than format for conversion.`;
    } else {
      s += ` Interestingly, your bottom performers gain similar subscribers (${fmt(bottomMedian)}) — subscriber conversion and raw view performance aren't strongly correlated on your channel.`;
    }
  }
  return s;
}

function buildTrafficInsight(agg: TrafficSourceBreakdown | null): string {
  if (!agg || agg.total < 100) return "";
  let s = `${agg.algorithmPct}% of your top videos' views come from YouTube's algorithm (browse + suggested).`;
  if (agg.searchPct >= 20) {
    s += ` Search drives ${agg.searchPct}% — your titles and topics have strong search intent.`;
  } else if (agg.searchPct >= 10) {
    s += ` Search contributes ${agg.searchPct}% — there's room to target more search-intent titles.`;
  }
  if (agg.externalPct >= 15) {
    s += ` ${agg.externalPct}% arrives from external sources, suggesting real cross-platform reach.`;
  }
  if (agg.algorithmPct >= 65) {
    s += ` You're algorithm-dependent — strong when YouTube favours you, vulnerable when it doesn't.`;
  } else if (agg.searchPct + agg.externalPct >= 35) {
    s += ` Your traffic is well-diversified across algorithm and owned sources.`;
  }
  return s;
}

function buildTrifectaInsight(allDiff: boolean, anyDiff: boolean): string {
  if (allDiff) {
    return "Your most-viewed, best-retained, and best-converting videos are three completely different videos. That's the 'views aren't everything' truth in hard data — viral reach, deep engagement, and subscriber conversion are pulling in different directions. The brief that targets all three is the brief worth making.";
  }
  if (anyDiff) {
    return "Two of your three key signals — most viewed, best retained, and best converting — belong to different videos. There's a real tension here between content that spreads and content that converts.";
  }
  return "Your best content aligns across reach, retention, and conversion — a strong signal these topics and formats are your core growth flywheel.";
}

export function computeGrowthAnalysis(
  topPerformers: VideoWithScore[],
  bottomPerformers: VideoWithScore[],
  allScored: VideoWithScore[],
  retentionSubsMap: Map<string, { relativeRetention: number | null; subsGained: number; subsLost: number }>,
  trafficMap: Map<string, Record<string, number>>,
  retentionAnalysis: RetentionAnalysis | undefined,
): GrowthAnalysis {
  // ── Subscriber conversion ─────────────────────────────────────────────────
  const allWithSubs: VideoSubsStat[] = allScored
    .filter((v) => retentionSubsMap.has(v.id))
    .map((v) => {
      const s = retentionSubsMap.get(v.id)!;
      return {
        videoId: v.id,
        title: v.title,
        views: v.viewCount,
        subsGained: s.subsGained,
        subsLost: s.subsLost,
        netSubs: s.subsGained - s.subsLost,
        subsPerThousandViews: v.viewCount > 0 ? Math.round((s.subsGained / v.viewCount) * 10000) / 10 : 0,
      };
    });

  const topSubsValues = topPerformers
    .filter((v) => retentionSubsMap.has(v.id))
    .map((v) => retentionSubsMap.get(v.id)!.subsGained);
  const bottomSubsValues = bottomPerformers
    .filter((v) => retentionSubsMap.has(v.id))
    .map((v) => retentionSubsMap.get(v.id)!.subsGained);

  const topMedianSubsGained = Math.round(median(topSubsValues));
  const bottomMedianSubsGained = Math.round(median(bottomSubsValues));
  const channelMedianSubsGained = Math.round(median(allWithSubs.map((v) => v.subsGained)));
  const thinSubsData = allWithSubs.length < 5;

  const topConverters = [...allWithSubs]
    .sort((a, b) => b.subsGained - a.subsGained)
    .slice(0, 10);

  // ── Traffic sources ───────────────────────────────────────────────────────
  const topVideosTraffic: GrowthAnalysis["topVideosTraffic"] = topPerformers
    .filter((v) => trafficMap.has(v.id))
    .slice(0, 8)
    .map((v) => ({
      videoId: v.id,
      title: v.title,
      views: v.viewCount,
      sources: parseTrafficSources(trafficMap.get(v.id)!),
    }));

  const videosWithTrafficData = allScored.filter((v) => trafficMap.has(v.id)).length;
  const thinTrafficData = topVideosTraffic.length < 3;
  const aggregateTraffic = mergeTraffic(topVideosTraffic.map((v) => v.sources));

  // ── Trifecta divergence ───────────────────────────────────────────────────
  const mostViewedVideoId = allScored[0]?.id ?? null;
  const mostViewedTitle = allScored[0]?.title ?? null;
  const bestRetainedVideoId = retentionAnalysis?.bestRetainedVideo?.videoId ?? null;
  const bestRetainedTitle = retentionAnalysis?.bestRetainedVideo?.title ?? null;
  const bestConvertingVideoId = topConverters[0]?.videoId ?? null;
  const bestConvertingTitle = topConverters[0]?.title ?? null;

  const ids = [mostViewedVideoId, bestRetainedVideoId, bestConvertingVideoId].filter(Boolean) as string[];
  const uniqueIds = new Set(ids);
  const trifectaDiverge = ids.length === 3 && uniqueIds.size === 3;
  const anyDiff = ids.length >= 2 && uniqueIds.size >= 2;

  return {
    videosWithSubsData: allWithSubs.length,
    totalVideosAnalysed: allScored.length,
    thinSubsData,
    channelMedianSubsGained,
    topMedianSubsGained,
    bottomMedianSubsGained,
    topConverters,
    conversionInsight: buildConversionInsight(topMedianSubsGained, bottomMedianSubsGained, allWithSubs.length),
    videosWithTrafficData,
    thinTrafficData,
    topVideosTraffic,
    aggregateTraffic,
    trafficInsight: buildTrafficInsight(aggregateTraffic),
    mostViewedVideoId,
    mostViewedTitle,
    bestRetainedVideoId,
    bestRetainedTitle,
    bestConvertingVideoId,
    bestConvertingTitle,
    trifectaDiverge,
    trifectaInsight: buildTrifectaInsight(trifectaDiverge, anyDiff),
  };
}

// ── Audience Analysis ──────────────────────────────────────────────────────────

import type { DemographicPoint } from "@/lib/youtube-analytics";
import type { AudienceAnalysis, DemographicAgeBand, CommentIntelligence } from "@/types";

const AGE_ORDER = ["age13-17", "age18-24", "age25-34", "age35-44", "age45-54", "age55-64", "age65-"];
const AGE_LABELS: Record<string, string> = {
  "age13-17": "13–17", "age18-24": "18–24", "age25-34": "25–34",
  "age35-44": "35–44", "age45-54": "45–54", "age55-64": "55–64", "age65-": "65+",
};

function buildPersonaConfirmation(
  ageBands: DemographicAgeBand[],
  under25Pct: number,
  commentIntel: CommentIntelligence | null,
): string {
  if (!ageBands.length) return "";

  const dominant = ageBands[0];
  const personaText = commentIntel?.audiencePersonas?.map((p) => `${p.type} ${p.description}`).join(" ").toLowerCase() ?? "";
  const personaIsYoung = /young|teen|student|gen.?z|millennial|18.?24|early.?career|college/i.test(personaText);
  const personaIsOlder = /middle.?age|older|40|50|senior|professional|career|parent/i.test(personaText);

  const confirmsYoung = personaIsYoung && under25Pct >= 50;
  const divergesYoung = personaIsYoung && under25Pct < 30;
  const confirmsOlder = personaIsOlder && (ageBands.find((b) => b.rawKey === "age35-44" || b.rawKey === "age45-54")?.viewerPct ?? 0) > 30;

  if (confirmsYoung) {
    return `Your comment tone reads young, and the data confirms it — ${under25Pct}% of your viewers are under 25. Content that speaks to early-stage life decisions, ambition, and identity will resonate across most of your audience.`;
  }
  if (divergesYoung) {
    return `Your comments suggest a younger audience, but the data tells a different story: only ${under25Pct}% are under 25. Your dominant age group is ${dominant.label} at ${Math.round(dominant.viewerPct)}%. Your content may read as relatable to younger viewers while actually converting an older demographic.`;
  }
  if (confirmsOlder) {
    return `Your comment analysis and demographics agree: your core audience is ${dominant.label} (${Math.round(dominant.viewerPct)}%). These viewers tend to be more deliberate and less driven by algorithmic impulse — quality and trust signals matter more than hooks designed for teens.`;
  }
  if (under25Pct >= 60) {
    return `A clear majority of your audience — ${under25Pct}% — is under 25. This is a young-skewing channel, which affects thumbnail expectations, title register, and optimal video length.`;
  }
  if (under25Pct <= 20) {
    return `Only ${under25Pct}% of your viewers are under 25. Your dominant age group is ${dominant.label} at ${Math.round(dominant.viewerPct)}%. This is a meaningful finding if your content style assumes a younger audience.`;
  }
  return `Your largest age group is ${dominant.label} at ${Math.round(dominant.viewerPct)}% of viewers — a broad but useful anchor for calibrating your content's assumed life context.`;
}

export function computeAudienceAnalysis(
  demographics: DemographicPoint[] | null,
  commentIntel: CommentIntelligence | null,
): AudienceAnalysis {
  const hasCommentData = !!(commentIntel && (commentIntel.themes.length > 0 || commentIntel.totalCommentsAnalysed > 0));

  if (!demographics?.length) {
    return {
      hasDemographicData: false,
      ageBands: [],
      dominantAgeGroup: null,
      dominantAgeGroupPct: null,
      under25Pct: null,
      malePct: null,
      femalePct: null,
      headlineStat: "",
      personaConfirmation: "",
      hasCommentData,
      commentSentiment: hasCommentData ? commentIntel!.sentimentBreakdown : null,
      emotionalSignals: hasCommentData ? commentIntel!.emotionalSignals : null,
    };
  }

  // Aggregate viewerPercentage by age group × gender
  const byAge = new Map<string, { male: number; female: number; other: number }>();
  let totalMale = 0, totalFemale = 0;
  for (const d of demographics) {
    const entry = byAge.get(d.ageGroup) ?? { male: 0, female: 0, other: 0 };
    if (d.gender === "male") { entry.male += d.viewerPercentage; totalMale += d.viewerPercentage; }
    else if (d.gender === "female") { entry.female += d.viewerPercentage; totalFemale += d.viewerPercentage; }
    else entry.other += d.viewerPercentage;
    byAge.set(d.ageGroup, entry);
  }

  const ageBands: DemographicAgeBand[] = AGE_ORDER
    .filter((k) => byAge.has(k))
    .map((k) => {
      const e = byAge.get(k)!;
      const total = e.male + e.female + e.other;
      return {
        label: AGE_LABELS[k] ?? k,
        rawKey: k,
        viewerPct: Math.round(total * 10) / 10,
        malePct: Math.round(e.male * 10) / 10,
        femalePct: Math.round(e.female * 10) / 10,
      };
    })
    .sort((a, b) => b.viewerPct - a.viewerPct);

  const dominant = ageBands[0];
  const under25Pct = Math.round(
    ageBands.filter((b) => b.rawKey === "age13-17" || b.rawKey === "age18-24")
      .reduce((s, b) => s + b.viewerPct, 0)
  );
  const malePct = Math.round(totalMale);
  const femalePct = Math.round(totalFemale);

  const headlineStat = dominant
    ? `${Math.round(dominant.viewerPct)}% of your viewers are ${dominant.label}`
    : "";

  const sortedForChart = [...ageBands].sort(
    (a, b) => AGE_ORDER.indexOf(a.rawKey) - AGE_ORDER.indexOf(b.rawKey)
  );

  return {
    hasDemographicData: true,
    ageBands: sortedForChart,
    dominantAgeGroup: dominant?.label ?? null,
    dominantAgeGroupPct: dominant ? Math.round(dominant.viewerPct) : null,
    under25Pct,
    malePct,
    femalePct,
    headlineStat,
    personaConfirmation: buildPersonaConfirmation(ageBands, under25Pct, commentIntel),
    hasCommentData,
    commentSentiment: hasCommentData ? commentIntel!.sentimentBreakdown : null,
    emotionalSignals: hasCommentData ? commentIntel!.emotionalSignals : null,
  };
}

// ── Cadence Analysis ───────────────────────────────────────────────────────────

import type { CadenceAnalysis, CadenceDayStat, FrequencyCorrelation, TrajectoryAnalysis, TrajectoryQuarter, TrajectoryVerdict } from "@/types";

const WEEK_DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const TIME_SLOTS: Array<{ label: string; start: number; end: number }> = [
  { label: "Morning (6–12)",    start: 6,  end: 12 },
  { label: "Afternoon (12–18)", start: 12, end: 18 },
  { label: "Evening (18–24)",   start: 18, end: 24 },
  { label: "Night (0–6)",       start: 0,  end: 6  },
];

export function computeCadenceAnalysis(allScored: VideoWithScore[]): CadenceAnalysis {
  const total = allScored.length;
  const channelMedianViews = Math.round(median(allScored.map((v) => v.viewCount)));
  const thinData = total < 20;

  // Top performers = top decile or top 10, whichever is smaller
  const topN = Math.min(10, Math.ceil(total * 0.1));
  const topIds = new Set(allScored.slice(0, topN).map((v) => v.id));

  // Group all videos by day-of-week
  const dayGroups = new Map<number, VideoWithScore[]>();
  const slotGroups = new Map<string, VideoWithScore[]>();

  for (const v of allScored) {
    const d = new Date(v.publishedAt);
    const day = d.getUTCDay();
    const hour = d.getUTCHours();
    if (!dayGroups.has(day)) dayGroups.set(day, []);
    dayGroups.get(day)!.push(v);
    const slot = TIME_SLOTS.find((s) => hour >= s.start && hour < s.end)?.label ?? "Night (0–6)";
    if (!slotGroups.has(slot)) slotGroups.set(slot, []);
    slotGroups.get(slot)!.push(v);
  }

  const byDay: CadenceDayStat[] = WEEK_DAYS.map((day, i) => {
    const group = dayGroups.get(i) ?? [];
    const med = group.length > 0 ? Math.round(median(group.map((v) => v.viewCount))) : 0;
    return {
      day,
      n: group.length,
      medianViews: med,
      relativeToChannel: channelMedianViews > 0 ? Math.round((med / channelMedianViews) * 100) / 100 : 1,
      topPerformerCount: group.filter((v) => topIds.has(v.id)).length,
      lowConfidence: group.length < 3,
    };
  }).filter((d) => d.n > 0);

  // Best reliable day (n ≥ 3)
  const reliableDays = byDay.filter((d) => !d.lowConfidence);
  const bestDayStat = reliableDays.length > 0
    ? reliableDays.reduce((a, b) => a.medianViews > b.medianViews ? a : b)
    : null;

  // Top-performer time slot
  let topPerformerTimeSlot: string | null = null;
  const slotTopCounts = TIME_SLOTS.map(({ label }) => {
    const group = slotGroups.get(label) ?? [];
    return { label, topCount: group.filter((v) => topIds.has(v.id)).length, n: group.length };
  }).filter((s) => s.n > 0);
  if (slotTopCounts.length > 1) {
    const best = slotTopCounts.reduce((a, b) => a.topCount > b.topCount ? a : b);
    if (best.topCount >= 2) topPerformerTimeSlot = best.label;
  }

  // Frequency-vs-performance correlation via calendar months
  const monthGroups = new Map<string, VideoWithScore[]>();
  for (const v of allScored) {
    const d = new Date(v.publishedAt);
    const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
    if (!monthGroups.has(key)) monthGroups.set(key, []);
    monthGroups.get(key)!.push(v);
  }

  let frequencyInsight = "";
  let frequencyCorrelates: FrequencyCorrelation = "insufficient";

  const monthStats = Array.from(monthGroups.values())
    .map((vids) => ({ count: vids.length, medViews: Math.round(median(vids.map((v) => v.viewCount))) }));

  if (monthStats.length >= 6) {
    const sorted = [...monthStats].sort((a, b) => a.count - b.count);
    const split = Math.floor(sorted.length / 3);
    const lowFreq = sorted.slice(0, split);
    const highFreq = sorted.slice(sorted.length - split);
    if (lowFreq.length >= 2 && highFreq.length >= 2) {
      const lowMed = Math.round(median(lowFreq.map((m) => m.medViews)));
      const highMed = Math.round(median(highFreq.map((m) => m.medViews)));
      const ratio = lowMed > 0 ? highMed / lowMed : 0;
      if (ratio > 1.2) {
        frequencyCorrelates = "more";
        frequencyInsight = `Months with more uploads had higher median views (${fmt(highMed)} vs ${fmt(lowMed)}) — posting more often correlates with better reach on this channel.`;
      } else if (ratio < 0.8) {
        frequencyCorrelates = "less";
        frequencyInsight = `Lighter posting months outperformed: ${fmt(lowMed)} median views when posting less vs ${fmt(highMed)} when posting more — fewer, more intentional uploads may work better here.`;
      } else {
        frequencyCorrelates = "none";
        frequencyInsight = `No meaningful correlation between upload frequency and median views (${fmt(lowMed)} light vs ${fmt(highMed)} heavy months) — performance is driven by something other than cadence.`;
      }
    }
  } else {
    frequencyInsight = `Only ${monthStats.length} month${monthStats.length === 1 ? "" : "s"} of data — not enough to detect a frequency-vs-performance pattern.`;
  }

  return {
    totalVideos: total,
    thinData,
    channelMedianViews,
    byDay,
    bestDay: bestDayStat?.day ?? null,
    bestDayMultiplier: bestDayStat ? Math.round(bestDayStat.relativeToChannel * 10) / 10 : null,
    topPerformerTimeSlot,
    frequencyInsight,
    frequencyCorrelates,
  };
}

// ── Trajectory Analysis ────────────────────────────────────────────────────────

export function computeTrajectoryAnalysis(allScored: VideoWithScore[]): TrajectoryAnalysis {
  // Sort chronologically
  const sorted = [...allScored].sort(
    (a, b) => new Date(a.publishedAt).getTime() - new Date(b.publishedAt).getTime()
  );

  if (sorted.length === 0) {
    return { quarters: [], verdict: "insufficient_data", verdictText: "No video data available.", recentMedianViews: null, priorMedianViews: null, changePercent: null };
  }

  // Group into calendar quarters
  const quarterMap = new Map<string, VideoWithScore[]>();
  for (const v of sorted) {
    const d = new Date(v.publishedAt);
    const q = Math.floor(d.getUTCMonth() / 3) + 1;
    const key = `${d.getUTCFullYear()}-Q${q}`;
    if (!quarterMap.has(key)) quarterMap.set(key, []);
    quarterMap.get(key)!.push(v);
  }

  const quarters: TrajectoryQuarter[] = Array.from(quarterMap.entries())
    .map(([key, videos]) => {
      const [year, qLabel] = key.split("-");
      const qNum = parseInt(qLabel.replace("Q", ""));
      const monthStart = (qNum - 1) * 3 + 1;
      return {
        label: `Q${qNum} ${year}`,
        startDate: `${year}-${String(monthStart).padStart(2, "0")}-01`,
        n: videos.length,
        medianViews: Math.round(median(videos.map((v) => v.viewCount))),
      };
    })
    .sort((a, b) => a.startDate.localeCompare(b.startDate));

  // Compare last two quarters with ≥ 2 videos each for the verdict
  const reliableQ = quarters.filter((q) => q.n >= 2);
  if (reliableQ.length < 2) {
    return {
      quarters,
      verdict: "insufficient_data",
      verdictText: `Only ${reliableQ.length} quarter${reliableQ.length === 1 ? "" : "s"} with enough videos — need at least two to determine trajectory.`,
      recentMedianViews: null,
      priorMedianViews: null,
      changePercent: null,
    };
  }

  const recent = reliableQ[reliableQ.length - 1];
  const prior = reliableQ[reliableQ.length - 2];
  const recentMedianViews = recent.medianViews;
  const priorMedianViews = prior.medianViews;
  const changePercent = priorMedianViews > 0
    ? Math.round(((recentMedianViews - priorMedianViews) / priorMedianViews) * 100)
    : null;

  let verdict: TrajectoryVerdict;
  let verdictText: string;

  // Use 25% threshold — newer videos naturally have fewer total views due to less accumulation time,
  // so a smaller threshold would flag cooling too readily.
  if (changePercent === null) {
    verdict = "insufficient_data";
    verdictText = "Cannot compute trajectory — no prior period data.";
  } else if (changePercent >= 25) {
    verdict = "accelerating";
    verdictText = `Accelerating: ${recent.label} videos median ${fmt(recentMedianViews)} views — ${changePercent}% above ${prior.label} (${fmt(priorMedianViews)}). Momentum is building.`;
  } else if (changePercent <= -25) {
    verdict = "cooling";
    verdictText = `Cooling: ${recent.label} videos median ${fmt(recentMedianViews)} views — ${Math.abs(changePercent)}% below ${prior.label} (${fmt(priorMedianViews)}). Note: newer videos may not have had time to accumulate views.`;
  } else {
    verdict = "steady";
    verdictText = `Steady: ${recent.label} median ${fmt(recentMedianViews)} views vs ${fmt(priorMedianViews)} in ${prior.label} — within normal variation.`;
  }

  return { quarters, verdict, verdictText, recentMedianViews, priorMedianViews, changePercent };
}
