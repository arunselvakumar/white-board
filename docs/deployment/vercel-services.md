# Vercel services

Create one Vercel project with its Root Directory set to the repository root. The root `vercel.json` builds the Marketing Site (`apps/marketing`) and Whiteboard (`apps/whiteboard`) as separate Next.js services.

| Public path                    | Service      |
| ------------------------------ | ------------ |
| `/app` and `/app/*`            | `whiteboard` |
| Everything else, including `/` | `marketing`  |

Whiteboard uses the Next.js `/app` base path. Its API docs are at `/app/api/docs`, and the RealtimeKit webhook is at `/app/api/webhooks/realtimekit`. Auth is Better Auth served at `/app/api/auth` (ADR-0034). In the Vercel project environment set:

- `BETTER_AUTH_SECRET` (generate with `openssl rand -base64 32`; required at build and run time) and `BETTER_AUTH_URL` (the public origin, without `/app`).
- `RESEND_API_KEY` and `EMAIL_FROM` (an address on a domain verified in Resend). Production sends email with Resend by default.
- Optionally `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`. Register `<BETTER_AUTH_URL>/app/api/auth/callback/google` as an authorized redirect URI in Google Cloud.
- A reachable Postgres `DATABASE_URL`, then run `bun run --filter @repo/db migrate:deploy` against it.
- The service credentials required by the features you enable.

Do not use the example localhost database URL in Vercel. Preview deployments trust their own `VERCEL_URL` and branch URL for auth, but Google sign-in works only on origins registered with Google.

The apps do not make server-to-server requests to each other. Browser navigation from Marketing to Whiteboard uses `/app/signup`, so there are no service bindings to configure. If a server-side call is added later, declare a binding on the calling service and read its injected URL at runtime.

Run `vercel dev -L` from the repository root to test the combined routing locally. It starts both services and injects any declared bindings. This deployment configuration does not run database migrations; run `bun run --filter @repo/db migrate:deploy` against the deployment database as a separate release step.
