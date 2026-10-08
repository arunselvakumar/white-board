# Whiteboard on its own subdomain

The Marketing Site and Whiteboard shared one Vercel project and one domain. `vercel.json` services sent `/app/*` to Whiteboard, which ran under the Next.js `basePath` `/app`, and everything else to the Marketing Site. Every Whiteboard URL carried `/app` (`/app/login`, `/app/api/auth`, `/app/api/docs`). Next.js strips that base path from `request.url`, which Better Auth's router had to work around.

## Decision

**Domains.** `white-board.io` and `www.white-board.io` serve the Marketing Site; `www` redirects to the apex. `app.white-board.io` serves Whiteboard at the root of its host: `/login`, `/students`, `/api/auth`, `/api/docs`.

**Vercel.** Two projects built from the same repository (`arunselvakumar/white-board`), each with its own Root Directory, as Vercel recommends for apps on separate domains:

| Project                 | Root Directory    | Domains                                |
| ----------------------- | ----------------- | -------------------------------------- |
| `white-board`           | `apps/whiteboard` | `app.white-board.io`                   |
| `white-board-marketing` | `apps/marketing`  | `white-board.io`, `www.white-board.io` |

`white-board` is the former `white-board-v3` project, renamed. It keeps the database, Neon, Cloudflare, and Better Auth settings. The root `vercel.json` (services) is removed.

**Code.** Whiteboard has no `basePath`. Better Auth's base path is `/api/auth`, invitation links are `https://app.white-board.io/accept-invitation?id=…`, and `BETTER_AUTH_URL` is `https://app.white-board.io`. The Marketing Site links to `NEXT_PUBLIC_WHITEBOARD_URL` (default `https://app.white-board.io`; `http://localhost:3001` in development).

**Old links keep working.** Whiteboard redirects `/app` and `/app/*` to the same path without the prefix. The Marketing Site redirects `/app` and `/app/*` to `app.white-board.io`. This covers bookmarks and invitation emails sent before the move.

**Webhooks don't follow redirects.** The Cloudflare RealtimeKit webhook must be re-registered at `https://app.white-board.io/api/webhooks/realtimekit`, and the Google OAuth redirect URI is `https://app.white-board.io/api/auth/callback/google`.

## Consequences

- A Session cookie is scoped to `app.white-board.io`. The Marketing Site never has a Session (CONTEXT.md), so nothing needs a shared cookie domain.
- Each app deploys independently. A Marketing Site change doesn't rebuild Whiteboard.
- Local development mirrors production: the Marketing Site on `localhost:3000`, Whiteboard on `localhost:3001`.

**Considered options:** keep one project and the `/app` path, with `app.white-board.io` only redirecting to `white-board.io/app`; one project with host-based routing between services, which Vercel doesn't document; two projects (chosen).
