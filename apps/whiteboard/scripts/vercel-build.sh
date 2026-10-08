#!/usr/bin/env bash
# Vercel build for Whiteboard (the `white-board` project, Root Directory
# apps/whiteboard). Production deploys apply pending database migrations
# before building. Preview deploys don't: Preview and Production share one
# database, so an unmerged pull request must never change it (ADR-0036).
set -euo pipefail

if [ "${VERCEL_ENV:-}" = "production" ]; then
  echo "Applying database migrations (production deploy)…"
  # Migrations need a direct connection; Neon's pooled URL can't take the
  # advisory lock Prisma uses.
  (
    cd ../../packages/db
    DATABASE_URL="${DATABASE_URL_UNPOOLED:-${DATABASE_URL:?DATABASE_URL is not set}}" \
      bun run migrate:deploy
  )
else
  echo "Skipping database migrations (VERCEL_ENV=${VERCEL_ENV:-unset})."
fi

# Vercel only puts turbo on PATH for its auto-detected build command.
cd ../..
exec bunx turbo run build --filter=whiteboard
