# Vercel projects

Whiteboard, the Marketing Site, and Construction Management deploy as three Vercel projects from the same repository, `arunselvakumar/white-board`, on the personal Vercel account (ADR-0035, ADR-0039). All three deploy `main` to production and every pull request to a preview.

| Project                   | Root Directory                 | Production domains                     |
| ------------------------- | ------------------------------ | -------------------------------------- |
| `white-board`             | `apps/whiteboard`              | `app.white-board.io`                   |
| `white-board-marketing`   | `apps/marketing`               | `white-board.io`, `www.white-board.io` |
| `construction-management` | `apps/construction-management` | `web.white-board.io`                   |

`www.white-board.io` redirects to `white-board.io`. In every project, keep "Include files outside the Root Directory" on, because the apps import the workspace packages.

## `white-board` (Whiteboard)

Build Command: `bash scripts/vercel-build.sh`. On production deploys it applies pending database migrations, then builds; preview deploys only build, because Preview and Production share one database (ADR-0036).

Whiteboard is served at the root of its host. Its API docs are at `/api/docs`, the RealtimeKit webhook is at `/api/webhooks/realtimekit`, and Better Auth is at `/api/auth` (ADR-0034). In the project environment set:

- `BETTER_AUTH_SECRET` (generate with `openssl rand -base64 32`; required at build and run time) and `BETTER_AUTH_URL=https://app.white-board.io`.
- `RESEND_API_KEY` and `EMAIL_FROM` (an address on a domain verified in Resend). Production sends email with Resend by default.
- Optionally `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`. Register `https://app.white-board.io/api/auth/callback/google` as an authorized redirect URI in Google Cloud.
- A reachable Postgres `DATABASE_URL`, and `DATABASE_URL_UNPOOLED` for migrations (the Neon integration sets both).
- The service credentials required by the features you enable. Register the RealtimeKit webhook at `https://app.white-board.io/api/webhooks/realtimekit`.

Do not use the example localhost database URL in Vercel. Preview deployments trust their own `VERCEL_URL` and branch URL for auth, but Google sign-in works only on origins registered with Google.

## `white-board-marketing` (Marketing Site)

The Marketing Site has no Session and needs no secrets. `NEXT_PUBLIC_WHITEBOARD_URL` overrides where Sign-in and Sign-up links go; it defaults to `https://app.white-board.io`.

## `construction-management` (Construction Management)

Construction Management has no Session and needs no secrets yet. It uses the Next.js preset with default commands.

## DNS (GoDaddy)

`white-board.io` is registered at GoDaddy and keeps its nameservers there. Add the records Vercel shows for each domain under the project's Settings → Domains: an `A` record for the apex, and `CNAME` records for `www`, `app`, and `web`. Leave any `MX` and `TXT` records for email alone.

The apps do not make server-to-server requests to each other.
