# Production deploys apply database migrations

Whiteboard's first production deploy on Better Auth went live before anyone ran its migrations, so the `identity` tables didn't exist and every auth request failed. Running `migrate:deploy` by hand against Neon was a step that could be forgotten, and it needed someone to copy the production database URL onto their machine.

## Decision

The `white-board` Vercel project builds with `bash scripts/vercel-build.sh` (in `apps/whiteboard`):

1. **Production deploys** (`VERCEL_ENV=production`, i.e. merges to `main`) run `prisma migrate deploy` first, over `DATABASE_URL_UNPOOLED`. Neon's pooled URL can't hold the advisory lock Prisma takes while migrating.
2. **Every deploy** then runs `turbo run build`, as before.

**Preview deploys never migrate.** Preview and Production share one Neon database, so a pull request must not change the production schema before it is merged.

If a migration fails, the build fails and the previous deployment keeps serving. A migration runs before its code is live, so migrations must stay backward compatible with the deployment that is still serving: add columns and tables freely. Renames and drops need the usual two-step (expand, then contract in a later deploy), or a short, accepted window of errors while the build finishes.

**Considered options:** run migrations by hand (what failed); run them in GitHub Actions on merge (needs the production database URL as a GitHub secret, and races the Vercel deploy); run them in the Vercel production build (chosen); a Neon branch per preview with migrations on every deploy (better isolation; worth revisiting when previews need their own data).
