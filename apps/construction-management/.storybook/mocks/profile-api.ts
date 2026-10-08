/**
 * A stand-in for `fetch` in stories that call our API. Each story answers
 * by method and path; anything unanswered is a 404 envelope so a missing
 * route fails loudly. Install it in `beforeEach` and return the cleanup.
 */
import { fn } from "storybook/test";

import { getQueryClient } from "../../src/queries/query-client";

export type ApiCall = { method: string; path: string; init?: RequestInit };

export type ApiHandler = (
  call: ApiCall,
) => Response | undefined | Promise<Response | undefined>;

function pathOf(input: Parameters<typeof fetch>[0]): string {
  const url =
    typeof input === "string"
      ? input
      : input instanceof URL
        ? input.href
        : input.url;
  return new URL(url, "http://storybook.local").pathname;
}

export function mockApi(handler: ApiHandler) {
  const original = globalThis.fetch;
  const spy = fn(
    async (...[input, init]: Parameters<typeof fetch>): Promise<Response> => {
      const call: ApiCall = {
        method: (init?.method ?? "GET").toUpperCase(),
        path: pathOf(input),
        ...(init == null ? {} : { init }),
      };
      const answer = await handler(call);
      return (
        answer ??
        Response.json(
          { code: "NOT_MOCKED", message: `${call.method} ${call.path}` },
          { status: 404 },
        )
      );
    },
  ).mockName("fetch");
  globalThis.fetch = spy;
  // Stories share one browser QueryClient; start each from nothing.
  getQueryClient().clear();
  return {
    spy,
    /** Calls to one route, in order. */
    calls: (method: string, path: string) =>
      spy.mock.calls
        .map(([input, init]) => ({
          method: (init?.method ?? "GET").toUpperCase(),
          path: pathOf(input),
          init,
        }))
        .filter((call) => call.method === method && call.path === path),
    restore: () => {
      globalThis.fetch = original;
      getQueryClient().clear();
    },
  };
}

/** The JSON body a call sent. */
export function sentJson(init: RequestInit | undefined): unknown {
  const body = init?.body;
  return typeof body === "string" ? (JSON.parse(body) as unknown) : null;
}

export function apiError(status: number, code: string, message: string) {
  return Response.json({ code, message }, { status });
}

/** A 1×1 PNG, so image previews render without a server. */
export const PIXEL_PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

/** A File of `size` bytes that starts like a PNG. */
export function pngFile(name = "logo.png", size = 128): File {
  const bytes = new Uint8Array(size);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  return new File([bytes], name, { type: "image/png" });
}
