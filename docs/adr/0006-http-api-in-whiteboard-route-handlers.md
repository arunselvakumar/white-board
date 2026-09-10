# HTTP API lives in Whiteboard as Next.js Route Handlers

Whiteboard is a startup: one Next.js app is cheaper to run and operate than a separate API process. HTTP APIs are Next.js Route Handlers under `apps/whiteboard` (`app/api/...`). Prisma lives in `packages/db`. We will extract a standalone API later if cost or scale requires it — not before.

**Considered options:** a new `apps/api` process; Route Handlers inside Whiteboard.

**Consequences:** CQRS, DDD, Zod, and Swagger all sit in the Whiteboard app (plus `packages/db`). Same deploy, same **Session**. Extraction later is a real move, not a rename.
