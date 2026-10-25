# CM-0031 — End-to-end tests with Playwright: every journey nightly, an `@pr` tag on PRs

- Status: accepted
- Date: 2026-10-24
- Relates to: root [ADR-0023](../../../../docs/adr/0023-domain-unit-tests-and-http-tests-on-postgres.md) (domain and HTTP tests on Postgres; "no Playwright for Todo"), [CM-0001](CM-0001-app-and-schemas.md) (files on disk without Blob), [CM-0029](CM-0029-sign-in-as-a-customer.md), [CM-0030](CM-0030-users-and-roles.md)

Construction Management is tested at three layers: domain unit tests, HTTP tests of the route handlers on Postgres, and Storybook play tests of single components. None of them runs the built app in a browser across several screens: the proxy redirect, the session cookie, `protectCompany()` in the layouts, server components and client forms together, the minified client bundle, and the report queue that drains in `after()`. #126 is the case in point: the production minifier broke the sign-up screen and no layer below the browser could have caught it.

The owner asked for end-to-end tests and set the shape on 2026-10-24: **every journey runs nightly; a tag picks the crucial ones, fewer than 40, for every PR and merge**, so CI minutes stay small. The owner also asked for page objects in the style of the `via` repository's Playwright tests.

## Decisions

1. **Playwright Test** (`@playwright/test`, pinned like `playwright`) in `apps/construction-management/e2e/`, laid out like `via`: `pages/` (page objects, one class per screen, locators by role and label in the words of CONTEXT.md), `helpers/` (`<name>PageTest.ts`, one `test.extend` fixture per page), `specs/` (one file per module, test names "should …, when …"), plus `api/` for arranging data and `fixtures/` for small files.
2. **Against a production build**, not `next dev`. `bun run test:e2e:build` builds into `.next-e2e` with `e2e/e2e.env`; Playwright serves it with `next start` on :3102. A developer's `next dev` on :3002 and its `.next` are left alone, and the build is the one that ships.
3. **`e2e/e2e.env` is the whole environment** (test-only values, committed): its own database `construction_e2e` (global setup runs `migrate deploy`, which creates it), Mailpit for every email, files on disk, rate limits off. `VERCEL_ENV=preview` marks it a production build that is not live production, so the guards that refuse test-only transports in live production still hold.
4. **Two small production-code changes**, both refused on Vercel or in live production:
   - Files on disk are allowed for a preview build off Vercel (`storage-from-env.ts`); on Vercel and in live production they are still refused.
   - `RAZORPAY_KEY_ID=rzp_test_fake` selects the existing in-process `FakePaymentGateway`, so checkout → verify → invoice runs for real. The browser's `checkout.js` is routed to a stand-in that signs the payment with the same key secret.
5. **Every test makes its own Company.** Owners sign up through the real auth routes and read the code from Mailpit; Companies, Projects, members (with a password, past the forced first change), masters, labour, goods receipts, tasks and issues are arranged through the app's own HTTP API. Only the screen under test is driven in the browser. Nothing is shared or wiped, so tests run in parallel. SQL is used once, to end a plan (`api/database.ts`), because no API can.
6. **Tags.** `@pr` marks the crucial journeys; PRs and merges to `main` run only those. **At most 40** (`bun run test:e2e:budget` fails CI above that): a new `@pr` test replaces one, or this ADR raises the budget first. `@mobile` tests also run on a phone viewport (Pixel 7). The nightly run takes everything.
7. **CI** (`.github/workflows/e2e.yml`): its own workflow, so GitHub's `paths` filter skips PRs that cannot reach the app. Postgres and Mailpit are service containers. Pull requests and pushes to `main` run `@pr`; a schedule at 02:00 IST and manual dispatch run everything, and the scheduled run skips itself when nothing was merged in the last 25 hours. One retry on CI, traces on the retry, the HTML report and failure videos uploaded only on failure.
8. **Coverage is journeys, not rules.** Validation messages, every permission flag, GST/TDS/PF arithmetic, leave accrual, each report kind and empty states stay in the HTTP and Storybook tests.

## Consequences

- PR runs: 30 `@pr` tests (34 with the phone repeats) in under a minute locally on 2 workers; the nightly run is 99 tests (103 with the phone repeats) in about 2 minutes, plus the build.
- `e2e.env` holds secrets only in name; real keys never go there.
- A screen whose role or label changes breaks its page object, which is the point: the words on screen are part of the contract.

## Considered options

- **`next dev` as the server.** Faster to start, but it is not what ships (#126 only broke in the minified build) and it grew to 10 GB walking every route.
- **Vitest browser mode, like Storybook.** One runner fewer, but it has no `webServer`, `storageState`, downloads, geolocation or traces.
- **Arranging data through the screens.** Closest to a user, but every test would pay for sign-up, company and master screens it does not test.
- **Seeding with Prisma from the test process.** Fast, but bypasses the API rules the screens rely on, and `@repo/construction-db` does not load under Playwright's ESM loader.
- **A path-filter action in `ci.yml`.** Needs a third-party action; a separate workflow uses GitHub's own `paths`.
