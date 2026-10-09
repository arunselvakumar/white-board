# Whiteboard

Turborepo monorepo for Whiteboard, managed with [Bun](https://bun.com).

## Apps and packages

- `apps/whiteboard` — Next.js application (port 3000) with TanStack Query and HTTP APIs, plus Storybook (port 6006)
- `apps/marketing` — Next.js marketing site (port 3001)
- `apps/construction-management` — Next.js Construction Management app (port 3002)
- `packages/db/whiteboard` (`@repo/whiteboard-db`) — Whiteboard's Prisma schema, migrations, and client
- `packages/db/construction` (`@repo/construction-db`) — Construction Management's Prisma schema, migrations, and client
- `packages/ui` — shared [shadcn/ui](https://ui.shadcn.com) component library (Tailwind CSS v4)
- `packages/eslint-config` — strict shared ESLint configs (type-aware)
- `packages/typescript-config` — shared TypeScript configs

## Commands

```sh
bun install
bun start
bun run lint
bun run check-types
bun run build
```

Filter a single app:

```sh
bun run dev --filter=whiteboard
bun run dev --filter=marketing
```

## Postgres

```sh
docker compose up -d
cp apps/whiteboard/.env.example apps/whiteboard/.env
cp packages/db/whiteboard/.env.example packages/db/whiteboard/.env
cp packages/db/construction/.env.example packages/db/construction/.env
bun run generate
bun run --filter @repo/whiteboard-db migrate:deploy
bun run --filter @repo/construction-db migrate:deploy
```

Each product has its own database and its own migration history (ADR-0040). A database created before that split still has the old shared history; drop it and migrate again:

```sh
docker compose exec postgres psql -U whiteboard -d postgres -c "DROP DATABASE whiteboard WITH (FORCE)" -c "CREATE DATABASE whiteboard"
docker compose exec postgres psql -U whiteboard -d postgres -c "DROP DATABASE construction WITH (FORCE)" -c "CREATE DATABASE construction"
```

The HTTP test databases (`whiteboard_test`, `construction_test`) need the same: drop them, and the next `bun run test:http` recreates them.

Whiteboard APIs: [http://localhost:3001/api/docs](http://localhost:3001/api/docs). The Marketing Site runs on [http://localhost:3000](http://localhost:3000).

```sh
bun run test
bun run test:http
```

HTTP tests use the `whiteboard_test` database on the same Compose instance.

## Adding shadcn/ui components

From the repo root:

```sh
bunx --bun shadcn@latest add button -c apps/whiteboard
```

Components are written to `packages/ui/src/components` and imported as:

```ts
import { Button } from "@repo/ui/components/button";
```

## TypeScript

Type-checking uses TypeScript 7 (`tsc` via `@typescript/native`). ESLint still uses the TypeScript 6 compiler API because typescript-eslint does not support TypeScript 7.0 yet. Keep both packages as installed at the root.
