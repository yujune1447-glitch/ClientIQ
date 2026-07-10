# CreatorIQ — Progress Log

*Living session-to-session memory. Read this at the START of every session; update it at the END. Pairs with `CreatorIQ_Master_Brief.md` (the what/why) and `CLAUDE.md` (technical rules). Between these three files + git, no lost chat can ever set you back.*

**How to use:** At session start, tell the assistant "read CLAUDE.md, CreatorIQ_Master_Brief.md, and PROGRESS.md." At session end, spend 60 seconds updating the four live sections below (Current Focus, Just Shipped, Next Up, Unverified). Keep it short — this is a log, not a document.

---

## Current Focus
**PHASE: VALIDATION BEFORE BUILDING — no new code until creators pay.** (See the STRATEGY UPDATE at the top of `CreatorIQ_Master_Brief.md` for the full pivot rationale.)

**Launch strategy:** **YouTube-FIRST wedge**, not cross-platform-first. The engine is deep where YouTube's API is deep; every competitor that actually monetizes ($29–50/mo: VidIQ, Spotter, ViewStats) is YouTube-first. Cross-platform is now a **year-2 expansion**, not the launch story.

**Product shape:** this is a **loop product with chat attached later**, not a chat product with a loop. Retention spine = **brief → prediction → detect the post → verdict vs prediction → next brief.** Briefing-first; chat is how you interrogate a briefing, not the home surface.

**Positioning:** **sell the outcome** — "know exactly what to make next, plus a prediction." The six-layer analysis is the ingredient, not the headline.

**What we're doing right now (v0 manual concierge, zero new code):**
- **Niche:** self-improvement YouTubers (~10k–500k subs, monetizing, posting ≥1×/week).
- **Deliverable:** a **1-page Game Plan** (2–3 insights + 2 briefs, each brief with a prediction) — NOT a dashboard screenshot. Assembled by hand for now; **Jake is the automation.**
- Public-data breakdowns need no login (YouTube Data API); the deep six-layer analysis needs the creator's OAuth.
- **Rollout:** (a) dogfood on Jake's own channel; (b) 10 creators on a trial **with a card on file** (14-day trial → $29/mo founding rate, cancel anytime) so willingness-to-pay is real; (c) they convert; (d) THEN build the v1 Monday Brief automation; (e) DM 100 more; (f) market with real results/case studies.
- **Gate to build v1:** **3 of 10 put a card down → build.** 1–2 → fix pitch/niche, not code. 0 → rethink.

**#1 risk = distribution.** The faith audience is for **credibility / peer positioning only**, never broadcast marketing.

**TikTok:** production app **SUBMITTED, awaiting review — PARKED.** Not part of v0; reopen in year 2.
**Instagram:** still blocked on Meta developer verification, no timeline. Not a launch gate — irrelevant to the YouTube-first wedge.

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

## Next Up (priority order) — validation motion, not build motion
1. **Dogfood the Game Plan on Jake's own channel** — prove the 1-page deliverable (2–3 insights + 2 briefs each with a prediction) is genuinely useful before selling it.
2. **Nail the pitch + the target list** — self-improvement YouTubers, ~10k–500k subs, monetizing, posting ≥1×/week. Assemble a DM list.
3. **Sign 10 creators onto the card-on-file trial** (14-day → $29/mo founding rate). Deliver each Game Plan **manually** (Jake is the automation).
4. **Watch the gate:** 3 of 10 put a card down → build v1. 1–2 → fix pitch/niche, not code. 0 → rethink.
5. **THEN (only after 3/10 pay) build v1:** automate the weekly **Monday Brief** (analysis + briefs + predictions, emailed).
6. **Solve distribution** (the #1 risk) — DM 100 more, then market with real results/case studies. Faith audience = credibility/peer positioning only, never broadcast.

### Deferred (post-validation / later versions)
- **v2 (after retention proven):** live verdict loop → chat-on-brief → cross-platform expansion + cross-creator intel (Pro tier).
- **TikTok:** production app submitted & parked; reopen year 2. `video.list` scope amendment waits until then.
- **Instagram:** passive Meta ticket; never a gate.
- **Account-merge gap:** TikTok-first + YouTube-first signups create two `users` rows. Irrelevant while YouTube-first; revisit at cross-platform expansion.

---

## Unverified — check on next fresh YouTube analysis (quota-gated)
- [ ] **Watch-time card** populates on Live Stats (needs estimatedMinutesWatched from a fresh pull; older cached data predates it).
- [ ] **Weekly growth** shows a real number via Analytics subscribersGained (not +0.0%).
- [ ] **Winning Hooks** fills in once captions are fetched on a fresh analysis (was 0% coverage).

---

## Blocked / Waiting on External (all PARKED — none gate v0)
- **TikTok production access** — submitted, in review, **PARKED.** Not part of v0; reopen year 2 when cross-platform expansion begins. `video.list` scope amendment waits until then.
- **Instagram** — blocked on Meta developer/SMS verification, no timeline. **PARKED.** Irrelevant to the YouTube-first wedge; never a launch gate.

---

## Key Decisions Made (don't relitigate)
- **YouTube-FIRST wedge, not cross-platform-first.** Engine is deep where YouTube's API is deep; every monetizing competitor is YouTube-first. Cross-platform = year-2 expansion.
- **Loop product with chat attached later**, not a chat product with a loop. Retention spine = brief → prediction → detect the post → verdict vs prediction → next brief. Briefing-first.
- **Sell the outcome** ("know exactly what to make next + a prediction"). Six-layer analysis is the ingredient, not the headline.
- **Validate before building** — no new code until 3 of 10 creators put a card down.
- **Distribution is the #1 risk.** Faith audience = credibility/peer positioning only, never broadcast marketing.
- **Monetization:** free-beta idea dropped. **$29/mo founding rate locked forever, 14-day trial with card up front, no free tier.** The only free thing is the one-time audit (lead magnet).
- **v0 = manual concierge** (connect → analytics → Jake+AI write the Game Plan → send by hand). v1 automates the Monday Brief only after 3/10 pay. v2 = verdict loop, then chat-on-brief, then expansion.
- **TikTok:** production app submitted & PARKED — not part of v0, reopen year 2.
- Stats always median, not mean; confidence-gate n<3.
- Recompute (0 quota) for verifying changes; Re-analyze (hits API) only for fresh data.
- CTR permanently unavailable from YouTube API — removed, not a bug.
- Model split: Opus for planning/strategy, Sonnet for execution in Claude Code.

---

## Working Style (for Claude Code)
Direct implementation (no plan-first gates); copy-paste prompts in code blocks with no `cd`/`npm run dev` line; batch to one verifiable unit; self-verify the build actually runs green (don't claim clean without running it); commit after each verified step. Address the founder as Jake.

**NEVER run/start/restart/kill a dev server.** A dev server always runs in Jake's own terminal. Verify with `npm run build` and curl production or `localhost:3000` directly.
