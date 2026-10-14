# TypeScript 7 in `next build`, TypeScript 6 for ESLint

From [issue #76](https://github.com/arunselvakumar/white-board/issues/76). The rest of #76 waits on TypeScript 7.1 and typescript-eslint: [issue #78](https://github.com/arunselvakumar/white-board/issues/78).

## Context

`tsc` in every `check-types` script already ran TypeScript 7.0.2 through the `@typescript/native` alias. The `typescript` package itself was 6.0.2, because TypeScript 7.0 has no JavaScript compiler API and typescript-eslint needs one.

TypeScript 7.1 will ship a new API, and typescript-eslint will support it after that ([typescript-eslint#10940](https://github.com/typescript-eslint/typescript-eslint/issues/10940)). On 2026-10-14 TypeScript 7.1 was only in nightly builds, and typescript-eslint 8.71.2 still declared `typescript >=4.8.4 <6.1.0`. Its TypeScript 7.1 support was a draft PR ([#12803](https://github.com/typescript-eslint/typescript-eslint/pull/12803)).

Next.js 16.3 already type-checks `next build` by running the `tsc` CLI instead of the API (`experimental.useTypeScriptCli`, on by default). It runs the `tsc` of the `typescript` package it resolves from the app's folder, not the `tsc` on `PATH`. So `next build` was checking with TypeScript 6.0.2 (Next's telemetry: `typeCheckMode: typescript-cli`, `typescriptVersion: 6.0.2`).

## Decision

- **Each Next app depends on `typescript` 7.0.2** in place of the `@typescript/native` alias. `next build` resolves it from the app's folder, so its type check runs TypeScript 7.
- **The root and the packages keep `typescript` 6.0.2.** typescript-eslint, Storybook's docgen, Prisma and anything else that imports `typescript` resolve it from the root, so they still get 6.0.2. ESLint passes unchanged.
- **`check-versions` skips `typescript`** (`--ignore-dep typescript`) while the versions differ on purpose. Every other dependency is still checked.
- **Next.js stays on 16.3.4.** It already has the CLI checker. 16.4.0 breaks every Storybook play test: its `useRouter` reads a field that `@storybook/nextjs-vite` 10.6.2's app-router mock does not provide ([storybookjs/storybook#36720](https://github.com/storybookjs/storybook/issues/36720)). The fix is merged but not released yet. Renovate brings 16.4 once a Storybook release has it.
- **The `next` tsserver plugin stays** in the tsconfigs. VS Code's built-in TypeScript is still 6.0.2 and loads it. The TypeScript 7 language server ignores it.
- **Construction Management keeps `ignoreBuildErrors` on Vercel** (#62). With TypeScript 7 the check is about 6× faster, but the build's peak memory did not change: webpack's compile and page-data workers set the peak, not the check. Turning the check back on would not lower the risk on Vercel's 8 GB build machine, and CI's `check-types` already gates every commit.

## Results

Type check inside `next build` (Next.js 16.3.4) on an M4 Pro, before (TypeScript 6.0.2) and after (TypeScript 7.0.2):

| App                     | TypeScript 6 (before) | TypeScript 7 (after) |
| ----------------------- | --------------------- | -------------------- |
| Marketing Site          | 1.0 s                 | 0.15–0.17 s          |
| Whiteboard              | 7.3–7.9 s             | 1.3 s                |
| Construction Management | 18.6–20.9 s           | 3.0–3.1 s            |

Two runs of `next build --webpack` per app; Next's telemetry reported `typeCheckMode: typescript-cli` and `typescriptVersion: 7.0.2` after. Construction Management's peak build memory (the whole process tree, sampled every 0.3 s) was 4.3–5.0 GB before and 4.9–5.0 GB after; the TypeScript 7 `tsc` process alone peaked at about 3.3 GB. Runs of the same build differed by up to 0.7 GB.

A type error still fails the build: `next build` prints `tsc`'s error and exits 1.

## Known limits

- An app's `next build` checks with 7.0.2 while its ESLint runs with 6.0.2. A file that only one of them accepts is possible but unlikely; `check-types` (7.0.2) is still the gate in CI.
- `useTypeScriptCli` is marked experimental in the Next.js docs although it is the default.
- typescript-eslint loads `typescript` from its own install at the root, which is why the apps' lint still gets 6.0.2. If Bun ever installs a copy of typescript-eslint inside an app, that copy would load 7.0.2 and fail.

## Considered options

- **Wait for TypeScript 7.1 and do all of #76 at once:** no change until then, and `next build` keeps the slower TypeScript 6 check.
- **`typescript` 7 at the root, TypeScript 6 only for typescript-eslint:** typescript-eslint imports `typescript` from the root, and Bun has no per-package overrides, so ESLint would load 7 and fail.
- **Microsoft's `@typescript/typescript6` alias for `typescript`:** it still gives Next.js TypeScript 6. Next.js finds its `tsc6` bin and runs TypeScript 6.
