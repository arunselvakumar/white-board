# Remove Storybook

## Context

Both apps (Whiteboard and Construction Management) had a Storybook with play-function tests: 346 story files, a `.storybook` folder in each app with mocks for auth, fetch, XHR and geolocation, 92 fixture and story-support files, a `storybook` Vitest project running in headless Chromium, and its own CI job.

It cost more than it caught:

- **Flaky.** Popup animations raced `userEvent` on busy CI runners. A global no-motion setup file fixed most of it, but new races kept appearing (the phone sidebar sheet, Select keyboard focus), and on #144 `main` was blocked because the same commit failed twice on different stories.
- **Verbose.** A screen needed a story file, fixtures, mocked routes and helpers that drifted between the two apps. Stories that hard-coded counts broke when unrelated modules were added.
- **Slow and heavy.** The job outgrew the 20-minute limit and had to be split out; locally it competed for memory with the HTTP tests and the dev server.
- **It held back upgrades.** Next.js was kept on 16.3 because 16.4 broke `@storybook/nextjs-vite`'s router mock (ADR-0045).

## Decision

Remove Storybook from the repo:

- Delete every story, both `.storybook` folders, and the fixtures, mocks and helpers only stories used. Construction Management's camera stand-in (`CameraContext`) went with them; screens call `useCamera()` directly.
- Drop the Storybook packages, `eslint-plugin-storybook`, `@vitest/browser-playwright`, `playwright` and `vite` from both apps' dev dependencies. Vitest keeps the `unit` and `http` projects. Construction Management's end-to-end tests keep `@playwright/test`.
- Remove the `storybook`, `build-storybook` and `test-storybook` scripts and turbo tasks, and the Storybook job from CI. `bun run dev` starts the apps only.

## Consequences

- No component-level browser tests remain. Rules stay covered by domain unit tests and HTTP tests on Postgres (ADR-0023). Construction Management's journeys are covered by Playwright against a production build (ADR CM-0031). Whiteboard UI is checked in the running app in a browser.
- Accessibility checks that ran through Storybook's axe addon (ADR-0044) are gone; lint (`jsx-a11y`) still runs.
- Next.js no longer has to wait for a Storybook release to move past 16.3.
- Older ADRs, PRDs and handoffs that mention Storybook describe how work was verified at the time and are left as they were.
