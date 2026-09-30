# Handoff: Online classes and Cloudflare recording

Updated: 2026-09-30. Resume from this file when continuing WB-009.

## Current state

- Branch: `feat/teacher-profile-expansion`. The working tree has uncommitted changes for WB-009 **and** unrelated Teacher profile work. Preserve both sets of edits; do not reset the tree.
- WB-009 remains `in_progress` in [`docs/prd/tasks.md`](docs/prd/tasks.md). Code is implemented locally. The RealtimeKit app and presets now exist, but R2 setup, deployment, and a live recorded-class test are pending.
- WB-006 (missed-date Attendance) is also `in_progress`. The Teacher profile work is marked done on the ticket board but is still uncommitted in this tree.

## What was implemented for WB-009

- Online and Hybrid Batches can choose an external HTTPS meeting link or a Whiteboard-hosted class. Offline Batches have no online join action. Batch forms, API models, OpenAPI, Calendar links, Prisma schema, and migrations were updated.
- `/classes/<batchId>/<date>/<startTime>` is the pre-join page. External links open in a new tab. Whiteboard classes use the RealtimeKit React UI kit with its device setup screen.
- A class occurrence is stored per Batch, local date, and start time. Active Workspace, Owner/assigned Teacher, and active Student/Parent Enrollment access are checked before start, join, and download.
- The server creates a RealtimeKit meeting. A signed webhook starts recording to a private R2 bucket when the meeting starts. Students and Parents can join only after recording reports `RECORDING`. Recording errors stop admission. Completed recordings are available to the Owner or assigned Teacher through a short-lived signed download URL.
- Missing Cloudflare configuration is checked before reserving an occurrence, so setup errors can be retried immediately.
- Main design: [`docs/superpowers/specs/2026-09-30-whiteboard-online-classes-design.md`](docs/superpowers/specs/2026-09-30-whiteboard-online-classes-design.md). Implementation plan: [`docs/superpowers/plans/2026-09-30-whiteboard-online-classes.md`](docs/superpowers/plans/2026-09-30-whiteboard-online-classes.md). Environment variables and setup: [`apps/whiteboard/README.md`](apps/whiteboard/README.md) and [`apps/whiteboard/.env.example`](apps/whiteboard/.env.example).

## Verification already performed

- Latest: `bun run check-types` passed; `bun run test` passed **157/157** unit tests; `bun run --filter whiteboard lint` passed; `git diff --check` passed.
- Earlier in this implementation, Postgres HTTP tests passed **85/85**, Storybook tests passed **119/119**, and the Whiteboard build passed. The latest sandbox blocks local port binding/Postgres access and external font resolution, so these three could not be rerun after the final small changes. Storybook's external, waiting, and recording-download states were also inspected in the browser.
- No real Cloudflare meeting or recording has been tested. Do not mark WB-009 `done` until that passes.

## Pending, in order

1. **User action required:** Cloudflare Dashboard is signed in. The open tab is on the R2 subscription page. Cloudflare shows $0 due now and free monthly usage, but clicking **Add R2 subscription to my account** accepts terms and starts a renewing usage-based subscription. The user must complete that action personally; the agent stopped before it. Do not paste credentials or secrets into chat.
2. RealtimeKit app **Whiteboard** was created in Cloudflare account `47f1201ab3118481f947bd3e565cad31`; app ID is `a6a73062-10be-420b-9ab0-6a1cfcbfdfa2`. Presets `whiteboard_host` and `whiteboard_student` were created. The host cannot manually start/stop recording or change participant presets. The Student has no host controls or screenshare. Configure these preset names through `CLOUDFLARE_REALTIMEKIT_HOST_PRESET` and `CLOUDFLARE_REALTIMEKIT_STUDENT_PRESET`.
3. After the user completes R2 subscription, create a **private** recordings bucket and restricted R2 credentials. Create a RealtimeKit API token and webhook for `meeting.started`, `meeting.ended`, and `recording.statusUpdate`. Creating persistent API credentials or changing sensitive access through the browser requires action-time confirmation under the browser policy. Use the instructions and exact environment variable names in the [Whiteboard README](apps/whiteboard/README.md).
4. The user plans to deploy on Vercel. Configure the secrets there, use the repository's root `vercel.json` Services setup, register the webhook against the public `/app/api/webhooks/realtimekit` URL, and apply the two WB-009 Prisma migrations. The existing Teacher profile migration may also need deploying, depending on deployment state. See [`docs/deployment/vercel-services.md`](docs/deployment/vercel-services.md).
5. Run a real Online or Hybrid Whiteboard class: Owner/assigned Teacher starts, recording becomes active, an enrolled Student joins, meeting ends, upload completes, and Owner/assigned Teacher downloads the MP4. Verify unauthorized Users cannot join or download.
6. Rerun `bun run test:http`, `bun run --filter whiteboard test-storybook`, and `bun run --filter whiteboard build` when the environment permits. Review the final diff without discarding the unrelated Teacher changes, then mark WB-009 `done` only after live verification.

## Resume guidance

Read `AGENTS.md`, `CONTEXT.md`, applicable ADRs, and the WB-009 spec before changing code. Useful skills for the next session: `superpowers:executing-plans` and `superpowers:verification-before-completion`. Cloudflare configuration should remain server-side; the R2 bucket must remain private.
