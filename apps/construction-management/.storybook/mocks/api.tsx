import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Suspense, useState, type ReactNode } from "react";
import { fn, type Mock } from "storybook/test";

export type ApiCall = { method: string; path: string; body: unknown };

type Handler = (call: ApiCall) => Response | undefined;

/**
 * Replaces `fetch` for one story: `handler` answers by method and path; an
 * unanswered call is a 404 so a missing mock fails loudly. Returns the spy
 * (calls carry the parsed JSON body) and a restore function for `beforeEach`.
 */
export function mockApi(handler: Handler): {
  calls: Mock<(call: ApiCall) => void>;
  restore: () => void;
} {
  const original = globalThis.fetch;
  const calls = fn<(call: ApiCall) => void>();
  globalThis.fetch = (input, init) => {
    const href =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.href
          : input.url;
    const url = new URL(href, "http://storybook.local");
    const raw = init?.body;
    const call: ApiCall = {
      method: (init?.method ?? "GET").toUpperCase(),
      path: url.pathname + url.search,
      body: typeof raw === "string" ? (JSON.parse(raw) as unknown) : undefined,
    };
    calls(call);
    return Promise.resolve(
      handler(call) ??
        Response.json(
          { code: "NOT_MOCKED", message: `${call.method} ${call.path}` },
          { status: 404 },
        ),
    );
  };
  return {
    calls,
    restore: () => {
      globalThis.fetch = original;
    },
  };
}

/** A fresh QueryClient per story, so cached reads never leak between stories. */
export function StoryQueries({ children }: { children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { retry: false, staleTime: Infinity } },
      }),
  );
  return (
    <QueryClientProvider client={client}>
      <Suspense fallback={<p>Loading…</p>}>{children}</Suspense>
    </QueryClientProvider>
  );
}
