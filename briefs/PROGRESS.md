# CreatorIQ — Progress Log

*Living session-to-session memory. Read this at the START of every session; update it at the END. Pairs with `CreatorIQ_Master_Brief.md` (the what/why) and `CLAUDE.md` (technical rules). Between these three files + git, no lost chat can ever set you back.*

**How to use:** At session start, tell the assistant "read CLAUDE.md, CreatorIQ_Master_Brief.md, and PROGRESS.md." At session end, spend 60 seconds updating the four live sections below (Current Focus, Just Shipped, Next Up, Unverified). Keep it short — this is a log, not a document.

---

## Current Focus
**Launch strategy:** ship cross-platform, launch on the first two platforms ready (YouTube + TikTok). Don't wait on Instagram.
**Critical path right now:** get TikTok live — submit production app (starts the ~2-week clock), resolve the privacy/terms URL verification issue, build the TikTok data layer + UI shell.

---

## Just Shipped (recent, verified)
- Six-layer Channel Analysis (Packaging, Retention, Growth, Audience, Cadence, Trajectory) + AI cross-layer synthesis TL;DR. Verified via recompute.
- Planning Content grounded in real channel data (briefs cite actual patterns).
- Quota-safe incremental fetch (re-runs ~32 units vs ~5,000) + Recompute path (0 YouTube API calls — use it to verify changes without burning quota).
- Feedback loop **Phase 1** (idea_outcomes capture): link a Done idea to a posted video, snapshot performance from cache. Retry-link verified working.
- Dashboard/Overview rebuilt; weekly growth switched to exact Analytics subscribersGained; logo routes to dashboard; saved-idea delete added.
- CLAUDE.md updated with hardened rules; idle context trimmed.

---

## Next Up (priority order)
1. **TikTok production application** — submit FIRST (starts the ~2-week approval clock). Resolve the "links can't be verified" issue on /privacy and /terms (likely vercel.app-subdomain not accepted, or JS-rendered page the crawler can't read — consider a verified custom domain).
2. **TikTok data layer + UI shell** — build ahead of approval (schema is known) so it lights up on approval.
3. **Stand up the marketing channel** — new build-in-public presence; warm the startup-circle + creator-friends cohort. Distribution is now the hardest unsolved problem (faith audience deliberately not used).
4. **Perf pass** on the full analysis (instrument + parallelize caption/comment fetches) — needs a fresh full run to measure.
5. Feedback loop Phase 2 (verdict re-grading) / Phase 3 (feed outcomes into Planning grounding) — **wait for real outcome data.**
6. UI/aesthetic polish pass — before showing to the cohort.

---

## Unverified — check on next fresh YouTube analysis (quota-gated)
- [ ] **Watch-time card** populates on Live Stats (needs estimatedMinutesWatched from a fresh pull; older cached data predates it).
- [ ] **Weekly growth** shows a real number via Analytics subscribersGained (not +0.0%).
- [ ] **Winning Hooks** fills in once captions are fetched on a fresh analysis (was 0% coverage).

---

## Blocked / Waiting on External
- **Instagram** — blocked on Meta developer/SMS verification. Support ticket pending, **no timeline.** Check the ticket (email on the Meta dev account + App Dashboard → Support) every few days. Do NOT retry the same SMS troubleshooting loop. Never the launch gate.
- **TikTok production access** — pending application (~2-week lag once submitted). Sandbox returns test accounts only (all zeros) until approved.

---

## Key Decisions Made (don't relitigate)
- Launch cross-platform, not YouTube-only. YouTube + TikTok is enough to launch; IG follows.
- NOT marketing to the faith audience — go to market via startup circle + creator friends + a dedicated new channel.
- Stats always median, not mean; confidence-gate n<3.
- Recompute (0 quota) for verifying changes; Re-analyze (hits API) only for fresh data.
- CTR permanently unavailable from YouTube API — removed, not a bug.

---

## Working Style (for Claude Code)
Direct implementation (no plan-first gates); copy-paste prompts in code blocks with no `cd`/`npm run dev` line; batch to one verifiable unit; self-verify the build actually runs green (don't claim clean without running it); commit after each verified step. Address the founder as Jake.
