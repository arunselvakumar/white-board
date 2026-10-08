import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Suspense, useState, type ReactNode } from "react";
import { fn } from "storybook/test";

import type { DesignationResponse } from "@/src/queries/designations";

/** Story-only helpers: a fresh query cache per story and a fake API. */

export function StoryQueryClient({ children }: { children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { retry: false, staleTime: Infinity },
          mutations: { retry: false },
        },
      }),
  );
  return (
    <QueryClientProvider client={client}>
      <Suspense fallback={<p className="p-6">Loading…</p>}>{children}</Suspense>
    </QueryClientProvider>
  );
}

type Route = (request: {
  url: string;
  method: string;
  body: unknown;
}) => Response | undefined;

function urlOf(input: Parameters<typeof fetch>[0]): string {
  if (typeof input === "string") return input;
  return input instanceof URL ? input.href : input.url;
}

/** Replaces `fetch` until the returned cleanup runs (a story `beforeEach`). */
export function fakeApi(route: Route) {
  const original = globalThis.fetch;
  const spy = fn((...args: Parameters<typeof fetch>) => {
    const [input, init] = args;
    const url = urlOf(input);
    const text = typeof init?.body === "string" ? init.body : "";
    const response = route({
      url: new URL(url, "http://localhost").pathname,
      method: init?.method ?? "GET",
      body: text === "" ? undefined : (JSON.parse(text) as unknown),
    });
    return Promise.resolve(
      response ??
        Response.json(
          { code: "NOT_FOUND", message: "Not found." },
          { status: 404 },
        ),
    );
  });
  globalThis.fetch = spy;
  return {
    spy,
    restore: () => {
      globalThis.fetch = original;
    },
  };
}

type FetchSpy = ReturnType<typeof fakeApi>["spy"];

export function calledPath(spy: FetchSpy, path: string): boolean {
  return spy.mock.calls.some(([input]) => urlOf(input).endsWith(path));
}

/** The JSON body of the spy's call to `path`, if any. */
export function sentTo(spy: FetchSpy, path: string): unknown {
  const call = spy.mock.calls.find(([input]) => urlOf(input).endsWith(path));
  const body = call?.[1]?.body;
  return typeof body === "string" ? (JSON.parse(body) as unknown) : undefined;
}

const AT = "2026-10-08T06:30:00.000Z";

export const SITE_ENGINEER: DesignationResponse = {
  id: "0199a1b2-0000-7000-8000-000000000001",
  name: "Site Engineer",
  isSeed: true,
  template: {
    "labour.attendance": ["create", "read", "update"],
    "site_work.daily_worksheet": ["create", "read", "update"],
  },
  createdAt: AT,
  updatedAt: AT,
};

export const STORY_DESIGNATIONS: DesignationResponse[] = [
  {
    id: "0199a1b2-0000-7000-8000-000000000002",
    name: "Accountant",
    isSeed: true,
    template: { "finance.petty_cash": ["create", "read"] },
    createdAt: AT,
    updatedAt: AT,
  },
  {
    id: "0199a1b2-0000-7000-8000-000000000003",
    name: "Billing Engineer",
    isSeed: false,
    template: null,
    createdAt: AT,
    updatedAt: AT,
  },
  {
    id: "0199a1b2-0000-7000-8000-000000000004",
    name: "Owner",
    isSeed: true,
    template: null,
    createdAt: AT,
    updatedAt: AT,
  },
  SITE_ENGINEER,
];
