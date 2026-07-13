// Detect-and-log grounding guard. Scans backward-looking metric claims in a
// generated brief (multipliers, percentages, view counts) and flags any that do
// not trace to a number present in the source data. Non-destructive: it only
// logs, so it can never alter or break a brief. Forward-looking projections
// (e.g. a prediction's "25K–40K" range) are intentionally NOT passed in.
//
// Matching is deliberately permissive — a claim is "grounded" if a matching
// number appears anywhere in the source data within tolerance. The goal is to
// surface clear fabrications (numbers that exist nowhere in the channel's data)
// during QA, not to nag about rounding.

export interface GroundingResult {
  checked: number;
  ungrounded: { field: string; value: string }[];
}

function collectSourceNumbers(obj: unknown, out: number[] = []): number[] {
  if (obj == null) return out;
  if (typeof obj === "number") {
    if (Number.isFinite(obj)) out.push(obj);
    return out;
  }
  if (typeof obj === "string") {
    const n = parseFloat(obj.replace(/,/g, ""));
    if (Number.isFinite(n) && /^\s*-?[\d,]+(?:\.\d+)?\s*$/.test(obj)) out.push(n);
    return out;
  }
  if (Array.isArray(obj)) {
    for (const v of obj) collectSourceNumbers(v, out);
    return out;
  }
  if (typeof obj === "object") {
    for (const v of Object.values(obj as Record<string, unknown>)) collectSourceNumbers(v, out);
    return out;
  }
  return out;
}

function expand(numStr: string, suffix?: string): number {
  const n = parseFloat(numStr.replace(/,/g, ""));
  if (suffix === "K" || suffix === "k") return n * 1_000;
  if (suffix === "M" || suffix === "m") return n * 1_000_000;
  return n;
}

interface Claim {
  value: number;
  raw: string;
}

// Only extract METRIC-shaped numbers (percentages, multipliers, view-scale
// figures). Bare small integers ("top 3 videos", "seconds 0–10") are counts, not
// metrics, and are ignored to keep the signal clean.
function extractMetricClaims(text: string): Claim[] {
  const claims: Claim[] = [];
  const push = (value: number, raw: string) => {
    if (Number.isFinite(value)) claims.push({ value, raw });
  };
  let m: RegExpExecArray | null;

  const pct = /(\d+(?:\.\d+)?)\s*%/g;
  while ((m = pct.exec(text))) push(parseFloat(m[1]), m[0]);

  const mult = /(\d+(?:\.\d+)?)\s*(?:×|x)(?![a-z0-9])/gi;
  while ((m = mult.exec(text))) push(parseFloat(m[1]), m[0]);

  const abbr = /(\d+(?:\.\d+)?)\s*([KM])\b/g;
  while ((m = abbr.exec(text))) push(expand(m[1], m[2]), m[0]);

  const commas = /\b(\d{1,3}(?:,\d{3})+)\b/g;
  while ((m = commas.exec(text))) push(expand(m[1]), m[0]);

  const views = /(\d[\d,]*)\s*views/gi;
  while ((m = views.exec(text))) push(expand(m[1]), m[0]);

  return claims;
}

function isGrounded(value: number, source: number[]): boolean {
  for (const s of source) {
    if (value === s) return true;
    const rel = Math.abs(value - s) / Math.max(Math.abs(value), Math.abs(s), 1);
    if (rel <= 0.05) return true; // view-scale rounding (e.g. 3.2K vs 3184)
    if (Math.abs(value - s) <= 0.2) return true; // multiplier / percent rounding
  }
  return false;
}

export function checkBriefGrounding(
  label: string,
  source: unknown,
  fields: Record<string, string | undefined>,
): GroundingResult {
  const sourceNums = collectSourceNumbers(source);
  const ungrounded: { field: string; value: string }[] = [];
  let checked = 0;

  for (const [field, text] of Object.entries(fields)) {
    if (!text) continue;
    for (const claim of extractMetricClaims(text)) {
      checked++;
      if (!isGrounded(claim.value, sourceNums)) ungrounded.push({ field, value: claim.raw.trim() });
    }
  }

  if (ungrounded.length) {
    console.warn(
      "[grounding] %s — %d/%d metric claims not found in source data: %s",
      label,
      ungrounded.length,
      checked,
      ungrounded.map((u) => `${u.field}:"${u.value}"`).join(", "),
    );
  } else {
    console.log("[grounding] %s — all %d metric claims trace to source data", label, checked);
  }

  return { checked, ungrounded };
}
