// Structured Claude API usage logging so cost-per-call (and per-user, where the
// caller has a userId) can be measured from logs going forward. No spend cutoffs
// live here — hard limits belong in the Anthropic Console, not app code.

export interface ClaudeUsage {
  input_tokens?: number;
  output_tokens?: number;
  cache_read_input_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
}

export function logUsage(site: string, model: string, usage: ClaudeUsage, userId?: string): void {
  const cacheRead = usage.cache_read_input_tokens ?? 0;
  const cacheCreate = usage.cache_creation_input_tokens ?? 0;
  const input = usage.input_tokens ?? 0;
  const output = usage.output_tokens ?? 0;
  // Single greppable line: `[usage] site=... model=... user=... input=... output=... cache_read=... cache_creation=...`
  console.log(
    "[usage] site=%s model=%s user=%s input=%d output=%d cache_read=%d cache_creation=%d",
    site,
    model,
    userId ?? "-",
    input,
    output,
    cacheRead,
    cacheCreate
  );
}
