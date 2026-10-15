# ADR-0046 — Construction Management previews build on GitHub runners

- Status: accepted
- Date: 2026-10-15
- Relates to: ADR-0040 (one database package per product), the Deploy workflow (#63)

## Context

Construction Management's `next build --webpack` outgrew Vercel's 8 GB build machine during M7 (2026-10-12): builds were killed for running out of memory. Skipping Next's in-build type check on Vercel (#62) bought some room, and production deploys moved to GitHub Actions (#63, `.github/workflows/deploy.yml`): build on a GitHub runner with `vercel build`, upload with `vercel deploy --prebuilt`. Pull-request previews stayed on Vercel's builders.

M8 (Tasks, Issues & Snags, Inspection Requests) added about 350 files to the app. Every preview build of the M8 pull requests since was killed by Vercel's out-of-memory guard (exit 137), so previews can no longer be built there.

## Decision

**Construction Management previews are built in a GitHub Actions workflow, `.github/workflows/preview.yml`, the same way production is.**

- On a pull request from a branch of this repository, the workflow asks turbo whether Construction Management is affected (its own files, or a package it uses such as `@repo/ui`). If so, it pulls the project's **Preview** environment, runs `vercel build` (the project's build command: migrations to the preview database, then the Next build) on the runner, and uploads the output with `vercel deploy --prebuilt`.
- The preview is recorded as a GitHub Deployment in `preview/construction-management`, so the pull request shows its link.
- One preview build runs at a time and is never cancelled midway, because all previews share one preview database and a build may be applying migrations.
- Vercel's git deployments are switched off for the `construction-management` project (`git.deploymentEnabled: false` in its `vercel.json`); production and previews both arrive as prebuilt output. Whiteboard and the Marketing Site keep Vercel's own previews.
- Pull requests from forks get no secrets and are not previewed.

## Consequences

- The "Vercel – construction-management" status disappears from pull requests; the "Preview construction-management" job and the deployment link take its place.
- Preview builds use GitHub Actions minutes instead of Vercel build minutes.
- Previews still migrate the shared preview database, so a branch with an old migration history can still wedge it (see the Vercel debugging notes); serialising builds avoids two branches migrating at once, not that.

## Considered options

- **A larger Vercel build machine** (a paid plan): fixes it without workflow code, but costs money every month for a build the GitHub runner already handles.
- **No Construction Management previews:** stops the red check, but loses the preview the owner checks screens on.
- **Cutting the build's memory:** Turbopack, webpack memory options, CPU limits and a V8 heap cap were tried in M7 and did not lower the peak enough.
