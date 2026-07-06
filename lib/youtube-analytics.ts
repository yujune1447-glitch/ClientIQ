const YT_ANALYTICS = "https://youtubeanalytics.googleapis.com/v2/reports";
const TODAY = new Date().toISOString().slice(0, 10);
const START_DATE = "2005-01-01";
const BATCH_SIZE = 50;

type Row = (string | number)[];

async function analyticsQuery(params: Record<string, string>, accessToken: string): Promise<Row[]> {
  const url = `${YT_ANALYTICS}?${new URLSearchParams(params)}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error?.message ?? `Analytics API ${res.status}`);
  return (data.rows as Row[]) ?? [];
}

export interface VideoRetentionSubs {
  relativeRetention: number | null;
  subsGained: number;
  subsLost: number;
}

export async function fetchRetentionSubsBatch(
  videoIds: string[],
  accessToken: string,
  skipIds: Set<string> = new Set(),
): Promise<Map<string, VideoRetentionSubs>> {
  const map = new Map<string, VideoRetentionSubs>();
  const toFetch = videoIds.filter((id) => !skipIds.has(id));
  if (!toFetch.length) return map;
  console.log(`[yt-analytics] fetchRetentionSubsBatch: ${toFetch.length}/${videoIds.length} to fetch (${skipIds.size} fresh in DB)`);

  for (let i = 0; i < toFetch.length; i += BATCH_SIZE) {
    const batch = toFetch.slice(i, i + BATCH_SIZE);
    const base = {
      ids: "channel==mine",
      dimensions: "video",
      filters: `video==${batch.join(",")}`,
      startDate: START_DATE,
      endDate: TODAY,
    };

    // Attempt with relativeRetentionPerformance; fall back if API rejects it
    let withRelative = true;
    let rows: Row[] = [];
    try {
      rows = await analyticsQuery({ ...base, metrics: "relativeRetentionPerformance,subscribersGained,subscribersLost" }, accessToken);
    } catch {
      withRelative = false;
      try {
        rows = await analyticsQuery({ ...base, metrics: "subscribersGained,subscribersLost" }, accessToken);
      } catch (err) {
        console.error(`[yt-analytics] retentionSubs batch ${i / BATCH_SIZE + 1} failed: ${err instanceof Error ? err.message : err}`);
        continue;
      }
    }

    for (const row of rows) {
      if (withRelative) {
        const [videoId, relRet, subsGained, subsLost] = row as [string, number, number, number];
        map.set(videoId, { relativeRetention: relRet, subsGained, subsLost });
      } else {
        const [videoId, subsGained, subsLost] = row as [string, number, number];
        map.set(videoId, { relativeRetention: null, subsGained, subsLost });
      }
    }
  }

  return map;
}

export type TrafficSources = Record<string, number>;

export async function fetchTrafficBatch(
  videoIds: string[],
  accessToken: string,
  skipIds: Set<string> = new Set(),
): Promise<Map<string, TrafficSources>> {
  const map = new Map<string, TrafficSources>();
  const toFetch = videoIds.filter((id) => !skipIds.has(id));
  if (!toFetch.length) return map;
  console.log(`[yt-analytics] fetchTrafficBatch: ${toFetch.length}/${videoIds.length} to fetch (${skipIds.size} fresh in DB)`);

  for (let i = 0; i < toFetch.length; i += BATCH_SIZE) {
    const batch = toFetch.slice(i, i + BATCH_SIZE);

    try {
      const rows = await analyticsQuery({
        ids: "channel==mine",
        dimensions: "video,insightTrafficSourceType",
        filters: `video==${batch.join(",")}`,
        metrics: "views",
        startDate: START_DATE,
        endDate: TODAY,
      }, accessToken);

      for (const [videoId, source, views] of rows as [string, string, number][]) {
        const existing = map.get(videoId) ?? {};
        existing[source] = (existing[source] ?? 0) + (views as number);
        map.set(videoId, existing);
      }
    } catch {
      // Combined dimension failed — fall back to per-video queries for this batch
      console.warn(`[yt-analytics] traffic batch ${i / BATCH_SIZE + 1}: combined dimension rejected, falling back to per-video`);
      for (const videoId of batch) {
        try {
          const rows = await analyticsQuery({
            ids: "channel==mine",
            dimensions: "insightTrafficSourceType",
            filters: `video==${videoId}`,
            metrics: "views",
            startDate: START_DATE,
            endDate: TODAY,
          }, accessToken);

          const sources: TrafficSources = {};
          for (const [source, views] of rows as [string, number][]) {
            sources[source] = views;
          }
          map.set(videoId, sources);
        } catch {
          // individual video failure is silent — skip
        }
      }
    }
  }

  return map;
}

export interface DemographicPoint {
  ageGroup: string;
  gender: string;
  viewerPercentage: number;
}

export async function fetchDemographics(accessToken: string): Promise<DemographicPoint[] | null> {
  try {
    const rows = await analyticsQuery({
      ids: "channel==mine",
      dimensions: "ageGroup,gender",
      metrics: "viewerPercentage",
      startDate: "2020-01-01",
      endDate: TODAY,
    }, accessToken);

    return (rows as [string, string, number][]).map(([ageGroup, gender, viewerPercentage]) => ({
      ageGroup,
      gender,
      viewerPercentage,
    }));
  } catch (err) {
    console.error(`[yt-analytics] fetchDemographics failed: ${err instanceof Error ? err.message : err}`);
    return null;
  }
}

export interface RetentionPoint {
  elapsed: number;
  ratio: number;
}

export async function fetchRetentionCurve(
  videoId: string,
  accessToken: string,
): Promise<RetentionPoint[] | null> {
  try {
    const rows = await analyticsQuery({
      ids: "channel==mine",
      dimensions: "elapsedVideoTimeRatio",
      filters: `video==${videoId}`,
      metrics: "audienceWatchRatio",
      startDate: START_DATE,
      endDate: TODAY,
    }, accessToken);

    return (rows as [number, number][]).map(([elapsed, ratio]) => ({ elapsed, ratio }));
  } catch (err) {
    console.error(`[yt-analytics] fetchRetentionCurve ${videoId} failed: ${err instanceof Error ? err.message : err}`);
    return null;
  }
}
