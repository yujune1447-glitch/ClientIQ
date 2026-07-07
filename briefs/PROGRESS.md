# CreatorIQ — Progress Log

*Living session-to-session memory. Read this at the START of every session; update it at the END. Pairs with `CreatorIQ_Master_Brief.md` (the what/why) and `CLAUDE.md` (technical rules). Between these three files + git, no lost chat can ever set you back.*

**How to use:** At session start, tell the assistant "read CLAUDE.md, CreatorIQ_Master_Brief.md, and PROGRESS.md." At session end, spend 60 seconds updating the four live sections below (Current Focus, Just Shipped, Next Up, Unverified). Keep it short — this is a log, not a document.

---

## Current Focus
**Launch strategy:** ship cross-platform, launch on the first two platforms ready (YouTube + TikTok). Don't wait on Instagram.
**Critical path right now:** TikTok production submission. App is configured; verification and OAuth are done. Remaining: record the demo video, fill the app-review explanation box, and submit (starts the ~2-week clock).

---

## Just Shipped (recent, verified)
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
1. **Record + submit the TikTok demo video** (1–2 min, voice narration, sandbox account `jaketamyujune`, on the root domain). Flow: open root site → Connect TikTok → authorize → show connected card naming each scope (basic = avatar/name, profile = profile info, stats = follower/following/likes/video counts) → click Privacy/Terms links. Fill the app-review explanation box, then submit.
2. **TikTok data layer + token-refresh + UI shell** — build DURING the ~2-week wait (schema is known) so it lights up the moment approval lands.
3. **Stand up the build-in-public marketing channel** — warm the startup-circle + creator-friends cohort. Distribution is the hardest unsolved problem (faith audience deliberately not used).
4. **Fresh YouTube pull** to verify the 3 open items (watch-time card, weekly growth, Winning Hooks).
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
- Submitting TikTok on the `vercel.app` domain — NO custom domain for now (not a blocker; pages verify fine). Revisit a domain later for marketing.
- Model split: Opus for planning/strategy, Sonnet for execution in Claude Code.

---

## Working Style (for Claude Code)
Direct implementation (no plan-first gates); copy-paste prompts in code blocks with no `cd`/`npm run dev` line; batch to one verifiable unit; self-verify the build actually runs green (don't claim clean without running it); commit after each verified step. Address the founder as Jake.

**NEVER run/start/restart/kill a dev server.** A dev server always runs in Jake's own terminal. Verify with `npm run build` and curl production or `localhost:3000` directly.
