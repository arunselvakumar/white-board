#!/usr/bin/env bash
# Vercel build for Construction Management (the `construction-management`
# project, Root Directory apps/construction-management; ADR CM-0001).
# Production and preview deploys apply pending migrations before building.
# Unlike Whiteboard (root ADR-0036), previews have their own Neon database,
# so migrating it never touches production data.
set -euo pipefail

case "${VERCEL_ENV:-}" in
  production | preview)
    echo "Applying database migrations (${VERCEL_ENV} deploy)…"
    # Migrations need a direct connection; Neon's pooled URL can't take the
    # advisory lock Prisma uses.
    (
      cd ../../packages/db/construction
      DATABASE_URL="${DATABASE_URL_UNPOOLED:-${DATABASE_URL:?DATABASE_URL is not set}}" \
        bun run migrate:deploy
    )
    ;;
  *)
    echo "Skipping database migrations (VERCEL_ENV=${VERCEL_ENV:-unset})."
    ;;
esac

# Vercel only puts turbo on PATH for its auto-detected build command.
cd ../..
exec bunx turbo run build --filter=construction-management
