# Whiteboard

Turborepo monorepo for Whiteboard, managed with [Bun](https://bun.com).

## Apps and packages

- `apps/whiteboard` — Next.js application (port 3000) with TanStack Query
- `apps/marketing` — Next.js marketing site (port 3001)
- `packages/ui` — shared [shadcn/ui](https://ui.shadcn.com) component library (Tailwind CSS v4)
- `packages/eslint-config` — strict shared ESLint configs (type-aware)
- `packages/typescript-config` — shared TypeScript configs

## Commands

```sh
bun install
bun run dev
bun run lint
bun run check-types
bun run build
```

Filter a single app:

```sh
bun run dev --filter=whiteboard
bun run dev --filter=marketing
```

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
