import type {
  QueryClient,
  QueryExecuteOptions,
  QueryKey,
} from "@tanstack/react-query";

import { headers } from "next/headers";

import type { QueryTransport } from "./http";

/** Request headers a handler may read the Session or the client from. */
const FORWARDED_HEADERS = [
  "cookie",
  "authorization",
  "user-agent",
  "accept-language",
  "x-forwarded-for",
  "x-real-ip",
];

/** A Next route handler: `GET(request)` or `GET(request, { params })`. */
export type RouteHandler = (
  request: Request,
  context: { params: Promise<Record<string, string>> },
) => Promise<Response>;

/**
 * A route handler typed with its own params (`{ id: string }`), as
 * `routeFetch` calls it: the params it fills come from the route's pattern.
 */
export function routeHandler<Params extends Record<string, string>>(
  handler: (
    request: Request,
    context: { params: Promise<Params> },
  ) => Promise<Response>,
): RouteHandler {
  return (request, context) =>
    handler(request, context as { params: Promise<Params> });
}

/**
 * A transport that answers a query by calling the app's own route handler in
 * the page's request (ADR-0052). The handler's Request carries the page
 * request's cookies, so it resolves the same Session whether it reads them
 * from `request.headers` or `next/headers`; tenancy, validation and the
 * Response model are the ones the browser gets. Keys are Next-style paths
 * (`/api/x/[id]`).
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
        const incoming = await headers();
        const forwarded = new Headers(init?.headers);
        for (const name of FORWARDED_HEADERS) {
          const value = incoming.get(name);
          if (value != null && !forwarded.has(name)) forwarded.set(name, value);
        }
        return handler(new Request(url, { ...init, headers: forwarded }), {
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
