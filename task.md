# Handoff: Online classes and Cloudflare recording

Updated: 2026-10-04. Resume from this file when continuing WB-009.

## Current state

- Branch: `main` at `0d2d789`. WB-009 and Teacher profile work are pushed. Preserve unrelated local UI edits in the working tree.
- WB-009 remains `in_progress` in [`docs/prd/tasks.md`](docs/prd/tasks.md). Vercel, Neon, Cloudflare, and the Owner recording/download flow work. The Student join and unauthorized User checks were deferred by the user.
- WB-006 (missed-date Attendance) is also `in_progress`.

## What was implemented for WB-009

- Online and Hybrid Batches can choose an external HTTPS meeting link or a Whiteboard-hosted class. Offline Batches have no online join action. Batch forms, API models, OpenAPI, Calendar links, Prisma schema, and migrations were updated.
- `/classes/<batchId>/<date>/<startTime>` is the pre-join page. External links open in a new tab. Whiteboard classes use the RealtimeKit React UI kit with its device setup screen.
- A class occurrence is stored per Batch, local date, and start time. Active Workspace, Owner/assigned Teacher, and active Student/Parent Enrollment access are checked before start, join, and download.
- The server creates a RealtimeKit meeting. A signed webhook starts recording to a private R2 bucket when the meeting starts. Students and Parents can join only after recording reports `RECORDING`. Recording errors stop admission. Completed recordings are available to the Owner or assigned Teacher through a short-lived signed download URL.
- Missing Cloudflare configuration is checked before reserving an occurrence, so setup errors can be retried immediately.
- Main design: [`docs/superpowers/specs/2026-09-30-whiteboard-online-classes-design.md`](docs/superpowers/specs/2026-09-30-whiteboard-online-classes-design.md). Implementation plan: [`docs/superpowers/plans/2026-09-30-whiteboard-online-classes.md`](docs/superpowers/plans/2026-09-30-whiteboard-online-classes.md). Environment variables and setup: [`apps/whiteboard/README.md`](apps/whiteboard/README.md) and [`apps/whiteboard/.env.example`](apps/whiteboard/.env.example).

## Verification already performed

- Latest: `bun run check-types`, `bun run --filter whiteboard lint`, and a webpack production build passed; unit tests passed **158/158**, Postgres HTTP tests **85/85**, Storybook tests **124/124**.
- Vercel production deployment `0d2d789` is **Ready** at `https://white-board-v3.vercel.app`. `/` serves the Marketing Site; `/app` redirects an unsigned User to login; `/app/api/docs` loads; a signed-in Owner can open the Owner Dashboard.
- All 14 Prisma migrations are applied to the linked Neon production database. The private R2 bucket and RealtimeKit webhook are active. A real Owner class recorded, uploaded, and downloaded a playable MP4.
- The Vercel Production deployment currently uses Clerk **development** keys for internal testing. Replace them with a production Clerk instance when the user chooses to pay for Clerk.

## Pending

1. The user deferred accepting the Clerk invitation for the test Student `b.arunselvakumar+1@gmail.com` and signing in as that Student. When ready, verify Student/Parent admission only after recording starts, and verify an unauthorized User cannot join or download. Do not mark WB-009 `done` before these checks.
2. In the Owner live test, leaving the RealtimeKit room did not immediately end the session. The test meeting was closed with the Cloudflare API, then the recording uploaded. Investigate whether this was normal session-end delay or whether an explicit Owner/Teacher “End class for everyone” control is needed. Do not claim automatic ending was verified.
3. Replace interim Clerk development keys in Vercel with production Clerk keys when the user chooses a paid plan. Decide an R2 recording retention policy before routine production use.

## Resume guidance

Read `AGENTS.md`, `CONTEXT.md`, applicable ADRs, and the WB-009 spec before changing code. Useful skills for the next session: `superpowers:executing-plans` and `superpowers:verification-before-completion`. Cloudflare configuration should remain server-side; the R2 bucket must remain private.

## 2026-10-04 continuation

- The user activated the R2 subscription. Created `whiteboard-class-recordings` in the existing Cloudflare account; its Public Access is **Disabled**. Created an account R2 token with Object Read & Write limited to that bucket. A temporary object was uploaded, read, and removed successfully.
- Created an enabled RealtimeKit webhook for `meeting.started`, `meeting.ended`, and `recording.statusUpdate` at the deployed `/app/api/webhooks/realtimekit` URL. Its configuration ID is `ee50b949-e45a-424e-b114-b869d43e0ca7`.
- Created a Realtime Admin account API token. A Cloudflare API read succeeded. Created a temporary RealtimeKit meeting, issued host and Student preset tokens, and deactivated the meeting successfully.
- Saved all nine Cloudflare values in ignored `apps/whiteboard/.env.local`, with file permissions `600`. No secret values are in this handoff. Aligned local Clerk redirect paths with `/app`.
- Fixed the proxy matcher so `/app` receives Clerk context. Local `/app` and `/app/students` now redirect to `/app/login`; `/app/login` and `/app/api/docs` return 200.
- Updated four Storybook expectations for the `/app` base path. Latest local verification: 157/157 unit tests, 85/85 Postgres HTTP tests, 124/124 Storybook tests, typecheck, lint, and a webpack production build passed. The default Turbopack build still fails locally while binding a port in a child process.
- Saved `CLOUDFLARE_REALTIMEKIT_WEBHOOK_ID` and `CLOUDFLARE_R2_RECORDINGS_BUCKET` as Vercel Production Config variables. The credential variables have not been sent to Vercel.
- **Still pending:** Production Clerk keys, Cloudflare Production Secret variables in Vercel, Neon Prisma migrations, a deployment containing the proxy fix, and a real recorded class. The Vercel CLI login needs renewal; user confirmation for its persistent access and for transmitting Cloudflare secrets to Vercel was requested. Do not mark WB-009 `done` until live verification.

### Later on 2026-10-04

- With the user's approval, renewed Vercel CLI access and saved the RealtimeKit API token plus both restricted R2 credentials as Vercel **Production Secret** variables. Added the two Clerk development keys from ignored `.env.local` to Vercel Production (`CLERK_SECRET_KEY` as Secret, publishable key as Config). This is an interim internal/test setup; replace them with production Clerk instance keys when the user chooses a paid plan. No Clerk upgrade was accepted.
- Signed in to the Vercel-linked Neon project after the user completed email verification. The direct `neondb` connection showed all 14 migrations pending. Applied all 14 with `prisma migrate deploy`, then `prisma migrate status` reported the schema up to date. The connection string was used only in process memory and was not added to the repository.
- Committed and pushed `9672636` for the `/app` auth matcher and corrected Storybook paths. Its Vercel build failed on a Next 16 Turbopack `next/font/google` resolver error. Changed the Whiteboard build script to `next build --webpack` and added Clerk variables to Turbo's `globalEnv`, verified the local production build, then committed and pushed `6568832`.
- Vercel deployed `6568832` to `https://white-board-v3.vercel.app` with status **Ready**. Read-only production checks: `/` 200, `/app` 307 to `/app/login`, `/app/login` 200, `/app/api/docs` 200.
- Fixed the post-login `/app/app` redirect and packaged Prisma’s native engine in the deployed Next output. Unit tests rose to 158; typecheck, lint, and webpack build passed. Committed and pushed `0d2d789`; the resulting Vercel deployment is Ready. The Owner signed in and opened the Owner Dashboard.
- Created test Course `WB-009 Recording Test` (`WB009-QA`) and Online Batch `WB-009 Sunday Recording QA` (`6d6f6f70-7636-4212-b647-934d8aaa3160`). The Owner started its 2026-10-04 13:10 Whiteboard class. The RealtimeKit UI displayed `REC`; a second tab showed the class live and recording.
- Added test Student `WB-009 Test Student` (`03efdff6-ecca-427b-959d-64e93088c909`) with `b.arunselvakumar+1@gmail.com` and an active Enrollment in that Batch, with the user's approval. Clerk sent an invitation. The user chose to skip the Student join test for now.
- After the host left, the pre-join page still showed the class live, so the test meeting was deactivated through the Cloudflare API. The `meeting.ended` and recording webhooks then moved the class to ended/ready. The Owner downloaded a 22,815,825-byte MP4; `ffprobe` found H264/AAC streams and a 284.8863-second duration. The local download is no longer present; use the class page to download it again if needed.
