import { fn } from "storybook/test";

type FetchArgs = Parameters<typeof fetch>;

export type MockRoute = {
  method?: string;
  /** Exact path, or a pattern matched against the path (no origin). */
  path: string | RegExp;
  respond: (request: { url: string; init?: RequestInit }) => Response;
};

function pathOf(input: FetchArgs[0]): string {
  const url =
    typeof input === "string"
      ? input
      : input instanceof URL
        ? input.href
        : input.url;
  return new URL(url, "http://storybook.local").pathname;
}

/**
 * Replaces `fetch` for one story. Unmatched calls answer 404 with the error
 * envelope, so a missing mock shows up as a visible failure.
 */
export function mockFetch(routes: MockRoute[]) {
  const original = globalThis.fetch;
  const spy = fn((...args: FetchArgs) => {
    const [input, init] = args;
    const path = pathOf(input);
    const method = (init?.method ?? "GET").toUpperCase();
    const route = routes.find(
      (candidate) =>
        (candidate.method ?? "GET").toUpperCase() === method &&
        (typeof candidate.path === "string"
          ? candidate.path === path
          : candidate.path.test(path)),
    );
    if (route == null)
      return Promise.resolve(
        Response.json(
          { code: "NOT_MOCKED", message: `${method} ${path} is not mocked.` },
          { status: 404 },
        ),
      );
    return Promise.resolve(route.respond({ url: path, init }));
  });
  globalThis.fetch = spy;
  return {
    spy,
    restore: () => {
      globalThis.fetch = original;
    },
  };
}
