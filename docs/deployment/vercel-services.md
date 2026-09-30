# Vercel services

Create one Vercel project with its Root Directory set to the repository root. The root `vercel.json` builds the Marketing Site (`apps/marketing`) and Whiteboard (`apps/whiteboard`) as separate Next.js services.

| Public path                    | Service      |
| ------------------------------ | ------------ |
| `/app` and `/app/*`            | `whiteboard` |
| Everything else, including `/` | `marketing`  |

Whiteboard uses the Next.js `/app` base path. Its API docs are at `/app/api/docs`, and the RealtimeKit webhook is at `/app/api/webhooks/realtimekit`. Configure Clerk redirect URLs and allowed origins with the same public `/app` paths. Set the Clerk paths shown in `apps/whiteboard/.env.example` in the Vercel project environment, along with the Clerk keys, a reachable Postgres `DATABASE_URL`, and the service credentials required by the features you enable. Do not use the example localhost database URL in Vercel.

The apps do not make server-to-server requests to each other. Browser navigation from Marketing to Whiteboard uses `/app/signup`, so there are no service bindings to configure. If a server-side call is added later, declare a binding on the calling service and read its injected URL at runtime.

Run `vercel dev -L` from the repository root to test the combined routing locally. It starts both services and injects any declared bindings. This deployment configuration does not run database migrations; run `bun run --filter @repo/db migrate:deploy` against the deployment database as a separate release step.
