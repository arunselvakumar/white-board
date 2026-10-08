#!/usr/bin/env bash
# Vercel build for Construction Management (the `construction-management`
# project, Root Directory apps/construction-management; ADR CM-0001).
# Production deploys apply pending migrations to the construction database
# before building; preview deploys never migrate (same rule as root ADR-0036).
set -euo pipefail

if [ "${VERCEL_ENV:-}" = "production" ]; then
  echo "Applying database migrations (production deploy)…"
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
exec bunx turbo run build --filter=construction-management
