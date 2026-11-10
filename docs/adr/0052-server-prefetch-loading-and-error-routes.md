# Pages prefetch on the server; `loading.tsx` and `error.tsx` replace `QuerySuspense`

Amends [ADR-0026](./0026-tanstack-query-suspense-for-client-reads.md) (how page reads reach data) and [ADR-0047](./0047-skeletons-that-match-the-page.md) (what a navigation shows). Issue #148.

## Context

Every page body in both apps sits inside `QuerySuspense` (`components/query-suspense.tsx`, one copy per app): a client-only gate (`useIsClient`), a `Suspense` boundary, and TanStack's `QueryErrorResetBoundary` with a hand-written error boundary. Construction Management wraps its root layout in one and uses it again in about 100 pages; Whiteboard wraps the whole `(app)` layout in one. No route has a `loading.tsx` or an `error.tsx`.

The gate exists because all reads run in the browser only. Query functions in `src/queries/*` call relative `/api/...` URLs with the browser's Session cookie, which a server render has neither of. So:

- The first HTML of every in-app page is the shell with an empty body. The browser then downloads the JavaScript, hydrates, renders the page's skeleton, fetches, and only then draws data: two round trips after the HTML before anything useful shows.
- ADR-0026 says "Server Components prefetch with `queryClient.prefetchQuery`", but `prefetchQuery` and `HydrationBoundary` appear zero times in either app. The ADR and the code have drifted.
- `loading.tsx` can't replace `QuerySuspense` on its own: it is a Suspense boundary Next renders on the server, and without the gate `useSuspenseQuery` would run during the server render with no base URL and no cookie, and fail.

Every route handler already resolves the Session itself: `requireSession()` / `requireAccess()` read the incoming request's cookies through `next/headers`, then check the role, the Active Workspace or Company, and the plan (ADR-0013, ADR-0014). A Server Component rendering the same request has the same cookies.

## Decision

**1. A page prefetches its reads on the server and hands them to the client in `HydrationBoundary`.** `page.tsx` becomes an async Server Component. It takes the per-request `QueryClient` (`getQueryClient()` already returns a fresh one on the server), awaits the queries its screen reads first, and renders the screen inside `<HydrationBoundary state={dehydrate(queryClient)}>`. The client screen is unchanged: it still calls `useSuspenseQuery` with the same `queryOptions`, finds the data in the cache, and renders on the server as HTML.

**2. The server reaches data by calling the route handler in-process.** The page imports the route's `GET` and passes it as the query's transport. The handler runs inside the page's request, so `requireSession()` sees the same cookies, and the page gets exactly what the browser would: the same validation, tenancy checks, status codes and Response model. There is no second read path to keep in step with the API, no HTTP call from the server to itself, and no cookie forwarding.

- `apiJson(input, init, meta)` takes an optional fetch-shaped transport, `meta.fetch`. In the browser there is none and it uses `fetch`.
- A query module's `queryFn` passes its context through: `queryFn: ({ meta }) => apiJson(url, undefined, meta)`. Modules change as their area migrates; the browser path is untouched.
- `prefetchRoute(queryClient, options, routes)` (server-only, `src/queries/route-fetch.ts`) runs the query with a transport built from a map of Next-style paths to handlers, filling `params` for dynamic segments: `prefetchRoute(queryClient, courseQueries.list({ limit: 12 }), { "/api/training-institute/courses": listCourses })`. It hands the transport to the query function's context, not to the query's options, so it is never stored with the query or serialised by `dehydrate`.
- `prefetchRoute` uses `queryClient.query` (it throws, unlike `prefetchQuery`) for the reads the first view needs, so a failure reaches `error.tsx` on the server instead of leaving the client to fetch a URL it can't reach during the server render. A prefetching page is `dynamic = "force-dynamic"`: it reads the request's cookies.
- On the server, `apiJson` without a transport throws "not prefetched" instead of fetching a relative URL. A screen that reads something the page didn't prefetch fails loudly in development and, in production, React renders that boundary on the client (a recoverable error), so a missed prefetch costs speed, not correctness.

**3. `loading.tsx` holds the page's skeleton; `error.tsx` holds its error state.** The skeleton that a page passed as `QuerySuspense`'s `fallback` moves to the route's `loading.tsx`. A route-group `error.tsx` replaces the hand-written boundary: "Couldn't load this page" with Try again, which resets TanStack's errored queries (`useQueryErrorResetBoundary().reset()`), refreshes the server segment (`router.refresh()`), and resets the boundary, in one transition.

**4. A navigation shows the next page's own skeleton at once.** Next renders the target's `loading.tsx` as soon as a link is clicked, then streams the page when its prefetch finishes. This replaces ADR-0047's amendment, which kept the current page on screen until the next one could show its skeleton. The ADR-0047 rule still holds: the only skeleton a user sees is the page's own, never a generic one first. Whiteboard's page transition (a `document.startViewTransition` around each link click) is skipped for these routes: holding the old snapshot during the transition made React wait for the animation before revealing the streamed page (Home to Courses took 888 ms with it, 130 ms without). The CSS enter animation still plays.

**5. Section boundaries stay.** The ~150 section-level `<Suspense>` boundaries in Construction Management (dashboard sections, tabs, side panels) stay as they are. A section either prefetches with its page (when it is on screen at first) or keeps a client-only boundary: `QuerySuspense` shrinks to `ClientSuspense`, the old gate for one section, with no error boundary of its own.

**6. Storybook doesn't change shape.** Stories render screens, not pages, under the same `QueryClientProvider` and mocked `fetch`; `meta.fetch` is absent there, so `apiJson` uses `fetch` as today. Story wrappers that used `QuerySuspense` use `Suspense` (or `ClientSuspense` for a section).

**7. It rolls out area by area.** While both kinds of page exist, the layout keeps one `QuerySuspense` whose client-only gate is skipped for paths listed in `SERVER_RENDERED_ROUTES` (a prefix list, one line per migrated area). An area is done when its pages prefetch, its skeletons are `loading.tsx` files, and its tests pass; when the list covers every in-app path, the gate and `QuerySuspense` go. The rollout checklist is in issue #148.

## Considered options

- **Keep client-only reads and simplify the boundary** (dedupe the two `QuerySuspense` copies, move fallbacks next to their pages). The smallest change, but the empty first HTML and the fetch waterfall stay, and `loading.tsx` still can't be used for query loading.
- **Server prefetch only on high-traffic pages** (dashboards, lists), client-only elsewhere. It keeps two models for good: every new page asks which one it is, and the gate never goes.
- **Server prefetch through the application layer** (call the query handlers in `src/` directly). Fastest, but it duplicates every route's Session, tenancy and plan checks and its Response mapping in a second place; a page could show what the API would refuse.
- **Server prefetch over HTTP** (`fetch` the app's own `/api` with the forwarded cookie). Same Response as the browser, but a network hop from the server to itself on every page, a base URL to configure per environment, and Vercel's preview protection in the way.

## Consequences

- The first HTML of a migrated page carries its data; the browser draws it before JavaScript loads, and the client makes no request for it after hydration.
- `page.tsx` files gain a few lines and import their routes' handlers. Route handlers must stay callable with a plain `Request` (no reliance on `NextRequest`-only fields without a fallback); the trial routes already are.
- Query modules gain `({ meta }) => apiJson(url, undefined, meta)` in each `queryFn` they share with a page.
- Mutations are unchanged: `useMutation` in the browser, invalidating keys as before.
- A server error now renders `error.tsx` from the server; an error during a later client refetch still reaches the nearest boundary, now `error.tsx`.
