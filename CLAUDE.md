## Session start — read these first
At the start of EVERY session, before doing anything else, read all files in the briefs/ folder (competitive brief, master brief, PROGRESS.md). Treat them as current context.

## Dev server — Jake runs it, never touch it
NEVER run, start, restart, or kill a dev server. A dev server always runs in Jake's own terminal on localhost:3000. Verify changes with `npm run build` (never `npm run dev`) and curl production or localhost:3000 directly. This supersedes the older "just run the dev server" lines below.

- Token efficient — no unnecessary output
- No comments in code unless logic is non-obvious
- No scaffolding comments, placeholder text, or TODO comments
- No console.logs unless critical
- Run `npm run dev` whenever needed — never ask permission
- Never ask to run the dev server — just run it
- Write concise responses, one sentence per action
- If asked a question, answer in one line
- No explaining what you're about to do — just do it
- No summarizing what you just did
- Never ask for permission, confirmation, or yes/no questions, never pause for approval
- Make all decisions autonomously and proceed
- If something can go wrong just fix it yourself
- Terminal output: one line maximum per action, no paragraphs, no explanations, just do it and say done
- Never ask yes/no questions, never ask for confirmation, never ask permission, make all decisions yourself and proceed
- Never modify or remove any rules from this file
- Full autonomy granted — never pause, never ask to proceed, never ask any question at all
- If uncertain, make a decision and continue
- Treat every message as full permission to complete the entire task

---

# CreatorIQ — Project Rules

## What this is
YouTube Studio + Meta Business Suite + TikTok Studio unified into one dashboard, with an AI layer that generates specific, data-grounded content structures (title, hook, length, outline) — not generic ideas. Built solo by Jake using Claude Code.

## Tech stack
- Next.js (App Router)
- Tailwind CSS
- Supabase (auth, db, storage)
- Claude API (analysis + chat)
- YouTube Data API v3 + YouTube Analytics API
- Instagram Graph API
- TikTok for Developers API

## Environment variables
- `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY` — Supabase project
- `ANTHROPIC_API_KEY` — Claude API
- `YOUTUBE_CLIENT_ID` / `YOUTUBE_CLIENT_SECRET` / `YOUTUBE_REDIRECT_URI` — Google Cloud Console OAuth client
- `TIKTOK_CLIENT_KEY` / `TIKTOK_CLIENT_SECRET` / `TIKTOK_REDIRECT_URI` — TikTok Developer Portal, app: ContentCreatorIQ
- `NEXT_PUBLIC_APP_URL` — full origin (e.g. `https://client-iq-tawny.vercel.app`); used for OAuth redirect construction and post-auth redirects

## Current status (update this section as you go)
- YouTube OAuth working, persistent login via refresh tokens
- Full channel data pull with pagination
- JS pre-processing layer before Claude analysis
- Claude API analysis wired up
- AI right panel with proactive rundowns
- Analysis page with channel stats
- Codebase cleaned of dead files
- Running locally only — not deployed to Vercel yet
- Instagram + TikTok integrations: not started

## Product rules (do not violate without asking Jake first)
- Dashboard is informational only — no AI, no actions, fixed grid, minimal scroll
- Right AI panel is always visible on platform pages, opens automatically on account click
- New AI chat every time an account is clicked or app opens fresh; new day = new chat
- AI always speaks first with a proactive rundown, never waits for user prompt
- Channel Analysis tab (Tab 2) runs weekly in background — not generated on page load
- Content Ideas tab (Tab 3) is on-demand only — never auto-generated
- Saved Ideas: AI-generated ideas always saveable; manual add allowed too (see decision log below)
- Done column in Saved Ideas archives, does not delete
- AI chat history is account-specific, never mixed across platforms, but a single chat can still answer cross-platform questions
- Pricing tiers gate features, not data quality — Free = 1 platform / Live Stats only / limited AI messages

## Decision log (resolved "still to flesh out" items)
- Manual idea creation: allowed, tagged source: manual vs source: ai in schema
- Done column: archives (hidden from default board view, retrievable via filter), does not delete
- Ideas For You: one platform at a time, scoped to whichever account's AI panel triggered it
- "Open in AI Chat" from Saved Ideas: opens the exact chat thread that generated the idea, on that idea's platform
- Saved Ideas page has search/filter by platform, status, and keyword

## Building protocol
- Two terminal tabs always: Tab 1 `cd creatoriq && npm run dev`, Tab 2 `cc` (Claude Code, --dangerously-skip-permissions)
- Kill zombie node processes with `killall node` before restarting dev server
- Build in focused, single-part increments — one feature/change at a time
- Test after every single change before moving to the next
- Git commit after every working part, with a clear message (no giant multi-feature commits)
- Never commit .env / API keys — confirm .gitignore covers Supabase and API credentials before first push

## Constraints
- Desktop only for now — do not build responsive/mobile layouts yet
- No push notifications — email only, and only for account-connect events
- Figma/wireframe phase happens before large UI build sessions; backend/API work can proceed in parallel without waiting on Figma

## Coding conventions
- Keep JS pre-processing layer decoupled from Claude API calls so platforms can be added independently
- Each platform (YouTube/Instagram/TikTok) should follow the same data contract into the analysis layer so Tab 1/2/3 UI components stay platform-agnostic
- Favor server components for data fetching, client components only where interactivity is required (AI panel, Kanban board, modals)

## Established standards (do not re-derive)
- **Stats: always MEDIAN, never mean.** The channel has extreme view outliers (viral videos) that skew means badly. Every per-group metric (day-of-week, time-of-day, duration bucket, title category, retention) uses median. Confidence-gate any pattern with n<3 (mark `lowConfidence` / hide from headline comparisons).
- **YouTube quota discipline.** Never re-pull data already cached in the DB. Enumerate a channel's videos via the uploads playlist (`playlistItems.list`, 1 unit/page) — never `search.list` (100 units). Never re-download captions for a video that already has a `caption_status` ('fetched' | 'unavailable' | 'failed'). Incremental video-details fetch only for new/recent uploads; stable old videos reuse cached rows.
- **Recompute vs Re-analyze.** Recompute regenerates the summary/brief/analysis layers purely from cached DB data (analyses + video_analytics + snapshots) with **zero** YouTube API calls. Only Re-analyze (`/analyzing?reanalyze=1`) hits the YouTube API. Keep the recompute path free of any googleapis call.
- **Analysis sections** follow the collapsible full-width pattern with confidence badges (thin-data / low-confidence indicators), consistent with existing Cadence/Retention/Growth/Trajectory sections.
- **Feedback loop phasing.** Phase 1 (capture: table + link UX + matching) is built. Phase 3 (feeding outcomes into `buildPlanInitPrompt` / AI consumption) waits until real outcome data actually exists — do not wire it up preemptively.

## Workflow rules (added 2026-07-03)
- Before reporting any task complete, run npm run build yourself and confirm no errors — don't rely on Jake to catch syntax/type errors.
- Prefer fewer, well-scoped prompts over many small back-and-forth ones for low-risk changes (layout, copy, non-logic UI).
- Still show a plan first (don't implement blind) for anything touching data logic, API calls, DB schema, or auth.
- Commit after every verified working step — this is the safety net for fast iteration, don't skip it.

## Current priority order (as of 2026-07-03)
1. Finish Instagram OAuth (was blocked on Meta Developer app setup)
2. Connect TikTok at minimal viable level
3. Cross-platform trend correlation (unlocked once 1-2 are done)
4. Keep sharpening Planning Content and Success Patterns
5. Live Stats stays at the simple/lean version already scoped — no further scope additions here without explicit sign-off

## Competitive context (why this order)
Project 6's defensible wedge is structured AI content briefs + idea pipeline — no competitor (TubeBuddy, VidIQ, Metricool, Hootsuite) does this well. VidIQ is the nearest threat and most likely to expand into cross-platform structured briefs. Live Stats/analytics is competitive parity at best, not a differentiator — don't over-invest there.

## Banked future moat ideas (not being built yet, for later)
- Feedback loop: track whether saved ideas actually got made and how they performed, feed back into AI recommendations
- Creator profile that deepens with use (voice, audience, history) — personalization moat, hard to cold-start elsewhere
- Aggregate cross-creator trend intelligence once user volume exists — network effect, nobody else can claim this
- Become the operational hub (planning + calendar), not just ideation — raises switching cost
- Jake documenting the build journey publicly — community/trust moat competitors can't replicate
