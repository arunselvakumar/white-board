# Pages prefetch on the server through their route handlers; `error.tsx` replaces `QuerySuspense`

Amends [ADR-0026](./0026-tanstack-query-suspense-for-client-reads.md) (how page reads reach data) and [ADR-0047](./0047-skeletons-that-match-the-page.md) (what a navigation shows). Issue #148.

## Context

Every page body in both apps sits inside `QuerySuspense` (`components/query-suspense.tsx`, one copy per app): a client-only gate (`useIsClient`), a `Suspense` boundary, and TanStack's `QueryErrorResetBoundary` with a hand-written error boundary. Construction Management wraps its root layout in one and uses it again in about 100 pages; Whiteboard wraps the whole `(app)` layout in one. No route has a `loading.tsx` or an `error.tsx`.

The gate exists because all reads run in the browser only. Query functions in `src/queries/*` call relative `/api/...` URLs with the browser's Session cookie, which a server render has neither of. So:

- The first HTML of every in-app page is the shell with an empty body. The browser then downloads the JavaScript, hydrates, renders the page's skeleton, fetches, and only then draws data: two round trips after the HTML before anything useful shows.
- ADR-0026 says "Server Components prefetch with `queryClient.prefetchQuery`", but `prefetchQuery` and `HydrationBoundary` appear zero times in either app. The ADR and the code have drifted.
- `loading.tsx` can't replace `QuerySuspense` on its own: it is a Suspense boundary Next renders on the server, and without the gate `useSuspenseQuery` would run during the server render with no base URL and no cookie, and fail.

Every route handler already resolves the Session itself from the request's cookies (`requireSession()` in Whiteboard through `next/headers`, `requireAccess(request, …)` in Construction Management from `request.headers`), then checks the role, the Active Workspace or Company, and the plan (ADR-0013, ADR-0014). A Server Component rendering the same request has the same cookies.

## Decision

**1. A page prefetches its reads on the server and hands them to the client in `HydrationBoundary`.** `page.tsx` becomes an async Server Component. It takes the per-request `QueryClient` (`getQueryClient()` already returns a fresh one on the server), awaits the queries its screen reads first, and renders the screen inside `<HydrationBoundary state={dehydrate(queryClient)}>`. The client screen is unchanged: it still calls `useSuspenseQuery` with the same `queryOptions`, finds the data in the cache, and renders on the server as HTML.

**2. The server reaches data by calling the route handler in-process.** The page imports the route's `GET` and runs the query through it. The handler gets a `Request` carrying the page request's cookies (and user agent and client IP), so it resolves the same Session whether it reads them from `request.headers` (Construction Management) or `next/headers` (Whiteboard), and the page gets exactly what the browser would: the same validation, tenancy checks, status codes and Response model. There is no second read path to keep in step with the API and no HTTP call from the server to itself.

- `apiJson(input, init, meta)` takes an optional fetch-shaped transport, `meta.fetch`. In the browser there is none and it uses `fetch`.
- A query module's `queryFn` passes its context through: `queryFn: ({ meta }) => apiJson(url, undefined, meta)`. Modules change as their area migrates; the browser path is untouched.
- `prefetchRoute(queryClient, options, routes)` (server-only, `src/queries/route-fetch.ts`) runs the query with a transport built from a map of Next-style paths to handlers, filling `params` for dynamic segments: `prefetchRoute(queryClient, courseQueries.list({ limit: 12 }), { "/api/training-institute/courses": listCourses })`. It hands the transport to the query function's context, not to the query's options, so it is never stored with the query or serialised by `dehydrate`.
- `prefetchRoute` uses `queryClient.query` (it throws, unlike `prefetchQuery`) for the reads the first view needs, so a failure reaches `error.tsx` on the server instead of leaving the client to fetch a URL it can't reach during the server render. A prefetching page is `dynamic = "force-dynamic"`: it reads the request's cookies.
- On the server, `apiJson` without a transport throws "not prefetched" instead of fetching a relative URL. A `useSuspenseQuery` read the page didn't prefetch therefore fails loudly in development and, in production, React renders that boundary on the client (a recoverable error). A `useQuery` read never runs during the server render, so a missed prefetch there throws nothing: the screen renders its loading state and fetches in the browser, as before. Either way a missed prefetch costs speed, not correctness; when migrating a page, check that it makes no request for its data after load (the trial's "client requests" column).

**3. `error.tsx` holds a page's error state; `loading.tsx` only where a page is slow.** A route-group `error.tsx` replaces the hand-written boundary for errors that leave nothing to show (a failed prefetch, or a suspending read with no data): "Couldn't load this page" with Try again, which resets TanStack's errored queries (`useQueryErrorResetBoundary().reset()`), refreshes the server segment (`router.refresh()`), and resets the boundary, in one transition. A migrated page gets **no** `loading.tsx` by default. The trial measured why (see Trial): once a streamed boundary has painted its fallback, React holds the content back for at least 300 ms, so a `loading.tsx` on a page whose prefetch takes tens of milliseconds made Construction Management's Projects page _slower_ on a full load (828 ms with it, 343 ms without) and did nothing for navigation (about 120 ms either way). A page whose reads are measured slower than about 300 ms gets a `loading.tsx` with its area's skeleton.

**4. A navigation keeps the current page until the next one is ready.** Without `loading.tsx`, Next keeps the current page on screen while it fetches the next page's server render, then swaps it in whole. That is ADR-0047's amendment ("the current page stays until the next one can show its own"), now with data instead of a skeleton: about 120 ms on the trial pages. Whiteboard's page transition (a view transition around each link click) keeps working as it is. While a migrated path is open, the layout's `QuerySuspense` adds no `Suspense` of its own above the page: two nested boundaries revealed the page in two throttled steps.

**5. Section boundaries stay.** The ~150 section-level `<Suspense>` boundaries in Construction Management (dashboard sections, tabs, side panels) stay as they are. A section either prefetches with its page (when it is on screen at first) or keeps a client-only boundary: `QuerySuspense` shrinks to `ClientSuspense`, the old gate for one section, with no error boundary of its own.

**6. Storybook doesn't change shape.** Stories render screens, not pages, under the same `QueryClientProvider` and mocked `fetch`; `meta.fetch` is absent there, so `apiJson` uses `fetch` as today. Story wrappers that used `QuerySuspense` use `Suspense` (or `ClientSuspense` for a section).

**7. It rolls out area by area.** While both kinds of page exist, the layout keeps one `QuerySuspense` whose client-only gate is skipped for the paths in `SERVER_RENDERED_ROUTES` (`lib/server-rendered-routes.ts`, one Next-style route per migrated page; `[id]` segments match any one segment, so `/courses/[id]` covers `/courses/123`). An area is done when every page in it prefetches what its first view reads and its tests pass; when the list covers every in-app path, the gate and `QuerySuspense` go, and the section-level `ClientSuspense` remains. The rollout checklist is in issue #148.

## Trial

Production builds (`next build --webpack`, `next start`) on a laptop, signed in as an Owner, median of 6 runs after a warm-up, measured with Playwright from navigation start to the page's data being visible:

| Page                                                   | Before | After  | Client requests for the page's data |
| ------------------------------------------------------ | ------ | ------ | ----------------------------------- |
| Whiteboard Courses, full load                          | 817 ms | 318 ms | 1 → 0                               |
| Whiteboard Home → Courses (sidebar)                    | 134 ms | 125 ms | 1 → 0                               |
| Construction Management Projects, full load            | 822 ms | 343 ms | 1 → 0                               |
| Construction Management Downloads → Projects (sidebar) | 891 ms | 121 ms | 1 → 0                               |
| Construction Management Settings, full load            | 622 ms | 376 ms | 1 → 0                               |

The first HTML of each trial page now carries its data (before: the shell with an empty page). Two things the trial changed in this decision: `loading.tsx` is not the default (decision 3), and the route handler's `Request` must carry the page request's cookies, because Construction Management's handlers read the Session from `request.headers` while Whiteboard's read `next/headers`.

## Known limits

- Fields bound with react-hook-form's `register` (uncontrolled inputs) fill in when the page hydrates, not in the server HTML; the data still arrives with the page, so there is no request or skeleton before them.
- Every query a page's first view reads must be prefetched. A missed `useSuspenseQuery` read fails loudly in development ("Not prefetched") and makes React render that boundary on the client in production; a missed `useQuery` read fails nothing and quietly fetches in the browser, so only the page's network requests show it.
- A Teacher opening an Owner-only page now gets a refused prefetch logged on the server before the Workspace Gate sends them home; the page is never shown.

## Considered options

- **Keep client-only reads and simplify the boundary** (dedupe the two `QuerySuspense` copies, move fallbacks next to their pages). The smallest change, but the empty first HTML and the fetch waterfall stay, and `loading.tsx` still can't be used for query loading.
- **Server prefetch only on high-traffic pages** (dashboards, lists), client-only elsewhere. It keeps two models for good: every new page asks which one it is, and the gate never goes.
- **Server prefetch through the application layer** (call the query handlers in `src/` directly). Fastest, but it duplicates every route's Session, tenancy and plan checks and its Response mapping in a second place; a page could show what the API would refuse.
- **Server prefetch over HTTP** (`fetch` the app's own `/api` with the forwarded cookie). Same Response as the browser, but a network hop from the server to itself on every page, a base URL to configure per environment, and Vercel's preview protection in the way.
- **`loading.tsx` on every migrated page** (the issue's starting point). Measured slower on full loads, for the reason in decision 3.

## Consequences

- The first HTML of a migrated page carries its data; the browser draws it before JavaScript loads, and the client makes no request for it after hydration.
- `page.tsx` files gain a few lines and import their routes' handlers. Route handlers must stay callable with a plain `Request` (no reliance on `NextRequest`-only fields without a fallback); the trial routes already are.
- Query modules gain `({ meta }) => apiJson(url, undefined, meta)` in each `queryFn` they share with a page.
- Mutations are unchanged: `useMutation` in the browser, invalidating keys as before.
- A failed prefetch now renders `error.tsx` from the server. In the browser, a read that fails with nothing to show (a `useSuspenseQuery` with no cached data) also reaches `error.tsx`. A failed background refetch does not: TanStack keeps the cached data on screen and reports the error on the query (`isError`), as it does today.
- A page's `*-skeletons.tsx` stays for its sections, its stories and pages not yet migrated; ADR-0047's lint guard is unchanged.
