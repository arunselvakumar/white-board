"use client";

import {
  hydrate,
  HydrationBoundary,
  useQueryClient,
  type DehydratedState,
} from "@tanstack/react-query";
import { useMemo, type ReactNode } from "react";

/**
 * `HydrationBoundary` for the Project shell's reads. The Project menu in the
 * app shell renders above it and reads the same Project and home, so they
 * are already in the cache, without data, when this renders.
 * `HydrationBoundary` fills an existing query only in an effect, after the
 * server render, so the shell's header would read them again on the server
 * (ADR-0052). This fills them during render instead, but only while nothing
 * observes them yet, so no other component is updated mid-render.
 */
export function ProjectHydrationBoundary({
  state,
  children,
}: {
  state: DehydratedState;
  children: ReactNode;
}) {
  const client = useQueryClient();
  useMemo(() => {
    const cache = client.getQueryCache();
    const empty = state.queries.filter((dehydrated) => {
      const existing = cache.get(dehydrated.queryHash);
      return (
        existing != null &&
        existing.state.data === undefined &&
        existing.getObserversCount() === 0
      );
    });
    if (empty.length > 0) hydrate(client, { mutations: [], queries: empty });
  }, [client, state]);
  return <HydrationBoundary state={state}>{children}</HydrationBoundary>;
}
