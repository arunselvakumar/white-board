# Client reads use TanStack Query queryOptions and Suspense

Whiteboard already has `QueryClientProvider`. In-app screens that read HTTP APIs do it with TanStack Query, not ad-hoc `fetch` in effects and not `useQuery` plus `isPending` branches.

**How:** one module per resource under `apps/whiteboard/src/queries`. Export a `queryOptions` factory (and the query key) from that module. Server Components prefetch with `queryClient.prefetchQuery`. Client Components call `useSuspenseQuery` with the same factory. The authenticated shell stays mounted; only the page body sits in `QuerySuspense` (`Suspense` + `QueryErrorResetBoundary`).

**Do not:** wrap Clerk (`useOrganization`, Session) in React Query. Do not invent custom `useCourses()` hooks that hide the options object. Do not use `useQuery` for page reads that have a Suspense boundary.

**Considered options:** `useQuery` + local loading flags; RSC-only `fetch` with no client cache; custom hooks per resource.

**Consequences:** loading and error UI live at the boundary, not in every screen. List/detail screens that ship after P0-002 follow the same module shape. Mutations stay `useMutation` and invalidate the resource key.

See [`.grok/skills/tanstack-query/SKILL.md`](../../.grok/skills/tanstack-query/SKILL.md).
