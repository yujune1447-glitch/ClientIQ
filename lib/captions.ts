const YT = "https://www.googleapis.com/youtube/v3";
const FIRST_N_SECONDS = 15;

export type CaptionStatus = "fetched" | "unavailable" | "failed";

export interface CaptionResult {
  status: CaptionStatus;
  text: string | null;
  lang: string | null;
}

interface CaptionTrack {
  id: string;
  language: string;
  trackKind: string;
}

export async function fetchCaption(videoId: string, accessToken: string): Promise<CaptionResult> {
  // Step 1: list all caption tracks for the video
  let tracks: CaptionTrack[] = [];
  try {
    const res = await fetch(`${YT}/captions?part=snippet&videoId=${videoId}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) return { status: "unavailable", text: null, lang: null };
    const data = await res.json();
    tracks = (data.items ?? []).map((item: { id: string; snippet: { language: string; trackKind: string } }) => ({
      id: item.id,
      language: item.snippet.language,
      trackKind: item.snippet.trackKind,
    }));
  } catch {
    return { status: "unavailable", text: null, lang: null };
  }

  if (!tracks.length) return { status: "unavailable", text: null, lang: null };

  // Prefer creator-uploaded ('standard') over auto-generated ('asr')
  const preferred =
    tracks.find((t) => t.trackKind === "standard") ??
    tracks.find((t) => t.trackKind === "asr") ??
    tracks[0];

  // Step 2: download and parse
  try {
    const res = await fetch(`${YT}/captions/${preferred.id}?tfmt=srt`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!res.ok) {
      // 403 on ASR is normal and expected — mark unavailable, not failed
      return { status: "unavailable", text: null, lang: null };
    }

    const srt = await res.text();
    const text = parseFirst15s(srt);

    return { status: "fetched", text: text || null, lang: preferred.language };
  } catch {
    return {
      status: preferred.trackKind === "asr" ? "unavailable" : "failed",
      text: null,
      lang: null,
    };
  }
}

function parseFirst15s(srt: string): string {
  const limitMs = FIRST_N_SECONDS * 1000;
  const segments: string[] = [];

  for (const block of srt.trim().split(/\n\s*\n/)) {
    const lines = block.trim().split("\n");
    const tsLine = lines.find((l) => l.includes("-->"));
    if (!tsLine) continue;

    const startMs = parseSrtTs(tsLine.split("-->")[0].trim());
    if (startMs >= limitMs) break;

    const text = lines
      .filter((l) => l !== tsLine && !/^\d+$/.test(l.trim()))
      .join(" ")
      .trim();
    if (text) segments.push(text);
  }

  return segments.join(" ").trim();
}

function parseSrtTs(ts: string): number {
  // Format: HH:MM:SS,mmm
  const [timePart, msPart] = ts.split(",");
  const [h, m, s] = timePart.split(":").map(Number);
  return (h * 3600 + m * 60 + s) * 1000 + Number(msPart ?? 0);
}
