# ADR-0046 — Construction Management previews build on GitHub runners

- Status: accepted
- Date: 2026-10-15
- Relates to: ADR-0040 (one database package per product), the Deploy workflow (#63)

## Context

Construction Management's `next build --webpack` outgrew Vercel's 8 GB build machine during M7 (2026-10-12): builds were killed for running out of memory. Skipping Next's in-build type check on Vercel (#62) bought some room, and production deploys moved to GitHub Actions (#63, `.github/workflows/deploy.yml`): build on a GitHub runner with `vercel build`, upload with `vercel deploy --prebuilt`. Pull-request previews stayed on Vercel's builders.

M8 (Tasks, Issues & Snags, Inspection Requests) added about 350 files to the app. Every preview build of the M8 pull requests since was killed by Vercel's out-of-memory guard (exit 137), so previews can no longer be built there.

## Decision

**Construction Management previews are built in a GitHub Actions workflow, `.github/workflows/preview.yml`, the same way production is.**

- On a pull request from a branch of this repository that carries the `preview` label, once CI has passed, the workflow asks turbo whether Construction Management is affected (its own files, or a package it uses such as `@repo/ui`). If so, it pulls the project's **Preview** environment, runs `vercel build` (the project's build command: migrations to the preview database, then the Next build) on the runner, and uploads the output with `vercel deploy --prebuilt`.
- The preview is recorded as a GitHub Deployment in `preview/construction-management`, so the pull request shows its link.
- One preview build runs at a time and is never cancelled midway, because all previews share one preview database and a build may be applying migrations.
- Vercel's git deployments are switched off for the `construction-management` project (`git.deploymentEnabled: false` in its `vercel.json`); production and previews both arrive as prebuilt output. Whiteboard and the Marketing Site keep Vercel's own previews.
- Pull requests from forks and from Dependabot get no secrets (and a read-only token) and are not previewed.

### Sensitive variables are placeholders at build time

`vercel pull` cannot read Vercel variables of the Secret (sensitive) type: it writes `[SENSITIVE]` in their place. The deployed functions still get the real values at runtime, but `next build` loads server modules on the runner with the placeholders. So nothing may read and validate a secret while a module loads: `@repo/auth`'s email sender now reads `EMAIL_TRANSPORT` when it sends the first email, not when it is created. (This is also why every production deploy of Construction Management from the Deploy workflow had failed since #63.) A build step that truly needs a secret cannot read it from Vercel. Whiteboard's production migrations need its direct database URL, a Vercel Secret, so the owner stored it as the repository secret `WHITEBOARD_DATABASE_URL_UNPOOLED`, and the Deploy workflow writes it over the placeholder before `vercel build`.

### The build trace stays behind

`vercel deploy --prebuilt` uploads every file of `.vercel/output`, and Vercel refuses a file over 100 MB. Next's build trace, which `vercel build` copies to `.vercel/output/diagnostics/trace`, is about 116 MB for Construction Management. It is only for Vercel's build diagnostics, so both workflows delete the `diagnostics` folder before uploading; the preview workflow then names any other file over 90 MB and stops.

### Previews are on request

A prebuilt deploy uploads every new file of the build output, and Vercel's free plan allows 5,000 file uploads a day, shared with production deploys. Construction Management's output is thousands of files, so previews on every push used up the day's allowance within hours (`api-upload-free`), which would also block a production deploy. So a pull request is previewed only when it carries the **`preview`** label and CI has passed on its latest commit: the workflow runs when the label is added (if CI already passed) and after every later CI pass while the label stays. Production deploys keep the rest of the allowance.

## Consequences

- The "Vercel – construction-management" status disappears from pull requests; the "Preview construction-management" job and the deployment link take its place.
- Preview builds use GitHub Actions minutes instead of Vercel build minutes.
- Previews still migrate the shared preview database, so a branch with an old migration history can still wedge it (see the Vercel debugging notes); serialising builds avoids two branches migrating at once, not that.

## Considered options

- **A larger Vercel build machine** (a paid plan): fixes it without workflow code, but costs money every month for a build the GitHub runner already handles.
- **No Construction Management previews:** stops the red check, but loses the preview the owner checks screens on.
- **Cutting the build's memory:** Turbopack, webpack memory options, CPU limits and a V8 heap cap were tried in M7 and did not lower the peak enough.
