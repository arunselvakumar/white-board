// Storybook-only helpers for the Notification and Absence Notice stories:
// answer /api/training-institute/* from story routes and give each story
// its own query cache. Never imported by the app.

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Decorator } from "@storybook/nextjs-vite";
import { useState } from "react";

import { QuerySuspense } from "@/components/query-suspense";

type Reply = { status?: number; json: unknown };
export type StoryRoute = (request: { url: URL; body: unknown }) => Reply;
export type StoryCall = { route: string; url: URL; body: unknown };

export const storyCalls: StoryCall[] = [];

export function callsTo(route: string): StoryCall[] {
  return storyCalls.filter((call) => call.route === route);
}

/**
 * Routes are keyed "GET /notifications". Returns the restore function, so a
 * story's `beforeEach` can return it as cleanup.
 */
export function mockApi(routes: Record<string, StoryRoute>): () => void {
  storyCalls.length = 0;
  const original = globalThis.fetch;
  globalThis.fetch = (input, init) => {
    const href =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.href
          : input.url;
    const url = new URL(href, window.location.origin);
    const path = url.pathname.replace(/^.*\/api\/training-institute/, "");
    const route = `${(init?.method ?? "GET").toUpperCase()} ${path}`;
    const handler = routes[route];
    if (handler == null) return original(input, init);
    const body: unknown =
      typeof init?.body === "string" ? JSON.parse(init.body) : undefined;
    storyCalls.push({ route, url, body });
    const reply = handler({ url, body });
    return Promise.resolve(
      new Response(JSON.stringify(reply.json), {
        status: reply.status ?? 200,
        headers: { "content-type": "application/json" },
      }),
    );
  };
  return () => {
    globalThis.fetch = original;
  };
}

/** Each story gets its own cache, so stories never see each other's data. */
export const withFreshQueryClient: Decorator = (Story) => {
  function Fresh() {
    const [client] = useState(
      () =>
        new QueryClient({
          defaultOptions: {
            queries: { retry: false, staleTime: 60_000 },
            mutations: { retry: false },
          },
        }),
    );
    return (
      <QueryClientProvider client={client}>
        <QuerySuspense>
          <Story />
        </QuerySuspense>
      </QueryClientProvider>
    );
  }
  return <Fresh />;
};

/** True when nothing on the page scrolls sideways (checked at 375 px too). */
export function hasNoHorizontalOverflow(canvasElement: HTMLElement): boolean {
  const root = canvasElement.ownerDocument.documentElement;
  return root.scrollWidth <= root.clientWidth;
}
