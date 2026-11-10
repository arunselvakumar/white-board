import type {
  QueryClient,
  QueryExecuteOptions,
  QueryKey,
} from "@tanstack/react-query";

import type { QueryTransport } from "./http";

/** A Next route handler: `GET(request)` or `GET(request, { params })`. */
export type RouteHandler = (
  request: Request,
  context: { params: Promise<Record<string, string>> },
) => Promise<Response>;

/**
 * A transport that answers a query by calling the app's own route handler in
 * the page's request (ADR-0052): the handler resolves the Session from the
 * request's cookies, so tenancy, validation and the Response model are the
 * ones the browser gets. Keys are Next-style paths (`/api/x/[id]`).
 */
export function routeFetch(
  routes: Record<string, RouteHandler>,
): QueryTransport {
  const compiled = Object.entries(routes).map(([pattern, handler]) => ({
    handler,
    segments: pattern.split("/"),
  }));

  return async (input, init) => {
    const href =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.href
          : input.url;
    const url = new URL(href, "http://route.internal");
    const path = url.pathname.split("/");

    for (const { handler, segments } of compiled) {
      if (segments.length !== path.length) continue;
      const params: Record<string, string> = {};
      const matches = segments.every((segment, index) => {
        const value = path[index] ?? "";
        const name = /^\[(\w+)\]$/.exec(segment)?.[1];
        if (name == null) return segment === value;
        params[name] = decodeURIComponent(value);
        return value !== "";
      });
      if (matches) {
        return handler(new Request(url, init), {
          params: Promise.resolve(params),
        });
      }
    }

    throw new Error(
      `No route handler for ${url.pathname}: add it to the page's prefetch.`,
    );
  };
}

/**
 * Fetches a query on the server through the given route handlers and keeps it
 * in `queryClient` for `dehydrate`. The transport goes in through the query
 * function's context, not the query's options, so it is never serialised.
 * Throws when the read fails, so the route's `error.tsx` shows.
 */
export async function prefetchRoute<TData, TKey extends QueryKey>(
  queryClient: QueryClient,
  options: QueryExecuteOptions<TData, Error, TData, TData, TKey>,
  routes: Record<string, RouteHandler>,
): Promise<TData> {
  const transport = routeFetch(routes);
  const { queryFn } = options;
  if (typeof queryFn !== "function") {
    throw new Error("prefetchRoute needs a query with a queryFn.");
  }
  return queryClient.query({
    ...options,
    queryFn: (context) =>
      queryFn({ ...context, meta: { ...context.meta, fetch: transport } }),
  });
}
