# CreatorIQ — Progress Log

*Living session-to-session memory. Read this at the START of every session; update it at the END. Pairs with `CreatorIQ_Master_Brief.md` (the what/why) and `CLAUDE.md` (technical rules). Between these three files + git, no lost chat can ever set you back.*

**How to use:** At session start, tell the assistant "read CLAUDE.md, CreatorIQ_Master_Brief.md, and PROGRESS.md." At session end, spend 60 seconds updating the four live sections below (Current Focus, Just Shipped, Next Up, Unverified). Keep it short — this is a log, not a document.

---

## Current Focus
**Launch strategy:** ship cross-platform, launch on the first two platforms ready (YouTube + TikTok). Don't wait on Instagram.
**Critical path right now:** TikTok is **in production review** — submitted, awaiting decision (~2-week clock running). Nothing to do but wait; build TikTok data/UI in parallel so it lights up on approval.
**Instagram:** still blocked on Meta developer verification, **no timeline.**
**YouTube:** daily quota currently **exhausted** — the 3 open verification items (watch-time card, weekly growth, Winning Hooks) still can't be checked until quota resets and a fresh pull runs.

---

## Just Shipped (recent, verified)
- **Cross-platform `/home` landing hub** — public connection hub; pick a platform, then open the dashboard. Cached data only, no API calls.
- **Removed YouTube auto-analysis-on-login** — logging in no longer triggers a full analysis; user drives it.
- **Cross-platform marketing page copy** — landing positioned as the unified cross-platform tool, not YouTube-only.
- **TikTok Live Stats + gated Channel Analysis tab** — TikTok view shows live stats; Channel Analysis gated behind production access (video.list scope).
- **TikTok signup bootstrap** — dual-identity `users` table (nullable `google_id` / `tiktok_open_id`); TikTok-first users can sign up with no Google account.
- **Fully isolated per-platform AI chat context** — each platform's chat is scoped to its own account, never mixed.
- **Prompt caching + usage logging on all Claude API calls** — static system prompts cached; every call logs token usage.
- **Re-analyze streaming/progress fix** — the three end-stage Claude calls now stream with live progress + a real synthesis step; kills the multi-minute frozen-UI issue.
- **TikTok disconnect** — Settings > Connected accounts; revokes the grant via `/v2/oauth/revoke/` (best-effort) + deletes the connection (cascades to tiktok_videos/analysis_cache, no orphans). Chat history kept.
- **TikTok OAuth audit passed end-to-end in sandbox.** Confirmed redirect_uri exactly matches portal: `https://client-iq-tawny.vercel.app/api/auth/tiktok/callback`.
- **Minimal scopes confirmed:** `user.info.basic`, `user.info.profile`, `user.info.stats` (each maps to a visible field on the connected-account card; no unused scopes).
- **Privacy/Terms links added IN-APP** (landing nav + footer, workspace sidebar) — was a review gap.
- **TikTok callback wrapped in try/catch:** all failure paths redirect to clean handled banners, no 500s/blank pages.
- **TikTok site verification uses the FILE method** (not meta tag). Built a DYNAMIC handler serving `/tiktok<CODE>.txt` for ANY code (body: `tiktok-developers-site-verification=<CODE>`), so the regenerating code can never block us again.
- Six-layer Channel Analysis (Packaging, Retention, Growth, Audience, Cadence, Trajectory) + AI cross-layer synthesis TL;DR. Verified via recompute.
- Planning Content grounded in real channel data (briefs cite actual patterns).
- Quota-safe incremental fetch (re-runs ~32 units vs ~5,000) + Recompute path (0 YouTube API calls — use it to verify changes without burning quota).
- Feedback loop **Phase 1** (idea_outcomes capture): link a Done idea to a posted video, snapshot performance from cache. Retry-link verified working.
- Dashboard/Overview rebuilt; weekly growth switched to exact Analytics subscribersGained; logo routes to dashboard; saved-idea delete added.
- CLAUDE.md updated with hardened rules; idle context trimmed.

---

## Next Up (priority order)
1. **Submit the `video.list` scope amendment** once the current TikTok review resolves (unlocks TikTok video data + Channel Analysis).
2. **Verify the 3 YouTube items on next quota reset** (watch-time card, weekly growth, Winning Hooks) via a fresh pull.
3. **UI/aesthetic polish pass** — before showing to the cohort.
4. **Stand up the build-in-public marketing channel** — warm the startup-circle + creator-friends cohort. Distribution is the hardest unsolved problem (faith audience deliberately not used).
5. Feedback loop Phase 2 (verdict re-grading) / Phase 3 (feed outcomes into Planning grounding) — **wait for real outcome data.**

### Backlog (low priority)
- **Account-merge gap:** a person who signs up TikTok-first AND YouTube-first creates two separate `users` rows (no identity linking across platforms yet). Fine for now; revisit if it bites.

---

## Unverified — check on next fresh YouTube analysis (quota-gated)
- [ ] **Watch-time card** populates on Live Stats (needs estimatedMinutesWatched from a fresh pull; older cached data predates it).
- [ ] **Weekly growth** shows a real number via Analytics subscribersGained (not +0.0%).
- [ ] **Winning Hooks** fills in once captions are fetched on a fresh analysis (was 0% coverage).

---

## Blocked / Waiting on External
- **Instagram** — blocked on Meta developer/SMS verification. Support ticket pending, **no timeline.** Check the ticket (email on the Meta dev account + App Dashboard → Support) every few days. Do NOT retry the same SMS troubleshooting loop. Never the launch gate.
- **TikTok production access** — **submitted, in review** (~2-week decision window). Sandbox returns test accounts only (all zeros) until approved. `video.list` scope amendment goes in once this resolves.

---

## Key Decisions Made (don't relitigate)
- Launch cross-platform, not YouTube-only. YouTube + TikTok is enough to launch; IG follows.
- NOT marketing to the faith audience — go to market via startup circle + creator friends + a dedicated new channel.
- Stats always median, not mean; confidence-gate n<3.
- Recompute (0 quota) for verifying changes; Re-analyze (hits API) only for fresh data.
- CTR permanently unavailable from YouTube API — removed, not a bug.
- Submitting TikTok on the `vercel.app` domain — NO custom domain for now (not a blocker; pages verify fine). Revisit a domain later for marketing.
- Model split: Opus for planning/strategy, Sonnet for execution in Claude Code.

---

## Working Style (for Claude Code)
Direct implementation (no plan-first gates); copy-paste prompts in code blocks with no `cd`/`npm run dev` line; batch to one verifiable unit; self-verify the build actually runs green (don't claim clean without running it); commit after each verified step. Address the founder as Jake.

**NEVER run/start/restart/kill a dev server.** A dev server always runs in Jake's own terminal. Verify with `npm run build` and curl production or `localhost:3000` directly.
