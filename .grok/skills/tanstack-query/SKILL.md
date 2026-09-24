---
name: tanstack-query
description: TanStack Query in Whiteboard — queryOptions factories under src/queries, useSuspenseQuery, prefetch + HydrationBoundary, QuerySuspense around page body. Use when adding or changing client reads, lists, detail screens, mutations that invalidate queries, or QueryClient setup in apps/whiteboard.
---

# TanStack Query

ADR-0026. Product HTTP stays in Route Handlers. This skill is how the Whiteboard client reads those APIs.

## Layout

```
apps/whiteboard/src/queries/
  query-client.ts     # getQueryClient() — server: new client, browser: singleton
  http.ts             # apiJson() — throws QueryHttpError with ADR-0017 envelope
  <resource>.ts       # query keys + queryOptions for one resource
```

Do not put query options next to domain code. Do not create a `use<Resource>()` hook that hides `queryOptions`.

## Resource module

```ts
import { queryOptions } from "@tanstack/react-query";

import { apiJson } from "./http";

export type CourseListFilters = { q?: string };

export const courseQueries = {
  key: {
    all: ["courses"] as const,
    list: (filters?: CourseListFilters) =>
      [...courseQueries.key.all, "list", filters] as const,
    detail: (id: string) => [...courseQueries.key.all, "detail", id] as const,
  },
  list: (filters?: CourseListFilters) =>
    queryOptions({
      queryKey: courseQueries.key.list(filters),
      queryFn: () => {
        const params = new URLSearchParams();
        if (filters?.q) params.set("q", filters.q);
        const query = params.size > 0 ? `?${params.toString()}` : "";
        return apiJson<CourseListResponse>(`/api/courses${query}`);
      },
    }),
  detail: (id: string) =>
    queryOptions({
      queryKey: courseQueries.key.detail(id),
      queryFn: () => apiJson<CourseResponse>(`/api/courses/${id}`),
    }),
};
```

Call sites pass the factory through, so prefetch and the hook share one key:

```ts
useSuspenseQuery(courseQueries.detail(id));
queryClient.prefetchQuery(courseQueries.list());
queryClient.invalidateQueries({ queryKey: courseQueries.key.all });
```

## Reads

- Page and list reads: `useSuspenseQuery`. The nearest `QuerySuspense` is the loading and error UI.
- Keep the App Shell outside that boundary so nav stays up while the page suspends.
- Prefetch in a Server Component when the route knows the id, then wrap with `HydrationBoundary`:

```tsx
const queryClient = getQueryClient();
void queryClient.prefetchQuery(courseQueries.detail(id));
return (
  <HydrationBoundary state={dehydrate(queryClient)}>
    <CourseDetail id={id} />
  </HydrationBoundary>
);
```

- `staleTime` defaults to 60s on the client. Do not set `refetchOnWindowFocus` per query unless the default is wrong for that resource.

## Do not

| Avoid | Use instead |
| --- | --- |
| `useQuery` + `isPending` on a page | `useSuspenseQuery` inside `QuerySuspense` |
| `useEffect` + `fetch` | `queryOptions` + `apiJson` |
| Clerk org/session in a queryFn | `useOrganization` / `useAuth` |
| `workspaceId` in the query key or body | Active Workspace on the Session (ADR-0014) |
| `enabled: false` on `useSuspenseQuery` | It is not supported — skip the component or use `useQuery` only for true optional reads |

Optional reads that must not throw (typeahead with an empty string, a panel the User has not opened) may use `useQuery`. That is the exception, not the default.

## Writes

`useMutation`. On success, `invalidateQueries` with the resource `key.all` (or a tighter list/detail key). Do not update the cache by hand unless the response is the new detail and you `setQueryData` with that same detail key.
