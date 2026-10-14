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

Type-checking uses TypeScript 7. ESLint still uses TypeScript 6 because typescript-eslint needs the compiler API, which TypeScript 7.0 does not have (ADR-0045).

| Tool                                     | TypeScript | From                                                          |
| ---------------------------------------- | ---------- | ------------------------------------------------------------- |
| `bun run check-types` (`tsc`)            | 7.0.2      | `@typescript/native` alias at the root and in the packages    |
| `next build` type check                  | 7.0.2      | `typescript` in each Next app; Next runs that package's `tsc` |
| ESLint (typescript-eslint), Storybook, … | 6.0.2      | `typescript` at the root and in the packages                  |

`check-versions` skips `typescript` because of this split. typescript-eslint loads `typescript` from the root, so the apps' lint still gets 6.0.2; check that it still does after changing either version.

In VS Code, the built-in TypeScript uses 6.0.2 and keeps the `next` tsserver plugin. The [TypeScript (Native Preview)](https://marketplace.visualstudio.com/items?itemName=TypeScriptTeam.native-preview) extension gives you the TypeScript 7 language server, which is faster but does not load tsserver plugins. Run “Disable TypeScript 7 Language Server” to switch back.
