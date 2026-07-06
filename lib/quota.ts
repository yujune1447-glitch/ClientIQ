export const DATA_API_COSTS = {
  "channels.list": 1,
  "playlistItems.list": 1,
  "videos.list": 1,
  "commentThreads.list": 1,
  "captions.list": 50,
  "captions.download": 200,
  "search.list": 100,
} as const;

export type DataApiCall = keyof typeof DATA_API_COSTS;

export class QuotaBudget {
  used = 0;
  private breakdown = new Map<string, { calls: number; units: number }>();

  constructor(readonly budget: number) {}

  charge(call: DataApiCall, times = 1): void {
    const units = DATA_API_COSTS[call] * times;
    this.used += units;
    const entry = this.breakdown.get(call) ?? { calls: 0, units: 0 };
    entry.calls += times;
    entry.units += units;
    this.breakdown.set(call, entry);
  }

  willExceed(call: DataApiCall, times = 1): boolean {
    return this.used + DATA_API_COSTS[call] * times > this.budget;
  }

  get remaining() {
    return this.budget - this.used;
  }

  toLog(): string {
    const lines = [`[quota] ${this.used}/${this.budget} units spent (${this.remaining} remaining)`];
    for (const [call, { calls, units }] of this.breakdown) {
      lines.push(`  ${call}: ${calls} call${calls !== 1 ? "s" : ""} = ${units} units`);
    }
    return lines.join("\n");
  }

  toJSON() {
    return {
      used: this.used,
      budget: this.budget,
      remaining: this.remaining,
      breakdown: Object.fromEntries(
        Array.from(this.breakdown.entries()).map(([k, v]) => [k, v])
      ),
    };
  }
}
