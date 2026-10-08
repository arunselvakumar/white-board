# Construction Management on its own subdomain

Construction Management is a new, separate Next.js app in `apps/construction-management`. It shares only the workspace config packages (`@repo/eslint-config`, `@repo/typescript-config`) and `@repo/ui` with the other apps. It needs a home on `white-board.io`.

## Decision

**Domain.** `web.white-board.io` serves Construction Management at the root of its host.

**Vercel.** A third project built from the same repository (`arunselvakumar/white-board`), following ADR-0035:

| Project                   | Root Directory                 | Domains              |
| ------------------------- | ------------------------------ | -------------------- |
| `construction-management` | `apps/construction-management` | `web.white-board.io` |

It uses the Marketing Site's settings: the Next.js framework preset with default commands, "Include files outside the Root Directory" on, and "Skip deployments when there are no changes" on.

**DNS.** `web` is a `CNAME` record in GoDaddy pointing at the target Vercel shows for the domain. Nameservers stay at GoDaddy.

## Consequences

- Construction Management deploys independently. A change to Whiteboard or the Marketing Site doesn't rebuild it.
- It has no Session and no secrets yet. When it gets auth, its cookie is scoped to `web.white-board.io`, separate from Whiteboard's on `app.white-board.io`.
- Locally it runs on `localhost:3002`.
