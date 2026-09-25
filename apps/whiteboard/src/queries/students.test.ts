import { QueryClient } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";

import { studentQueries } from "./students";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("student list query", () => {
  it("requests a bounded page with the search and next cursor", async () => {
    const fetch = vi.fn(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            items: [],
            nextCursor: null,
            prevCursor: null,
            total: 0,
          }),
          { status: 200 },
        ),
      ),
    );
    vi.stubGlobal("fetch", fetch);

    const client = new QueryClient();
    await client.query(
      studentQueries.list("Anita", { limit: 12, after: "next-page" }),
    );

    expect(fetch).toHaveBeenCalledWith(
      "/api/students?limit=12&q=Anita&after=next-page",
      expect.any(Object),
    );
  });

  it("requests the previous page using before", async () => {
    const fetch = vi.fn(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            items: [],
            nextCursor: null,
            prevCursor: null,
            total: 0,
          }),
          { status: 200 },
        ),
      ),
    );
    vi.stubGlobal("fetch", fetch);

    const client = new QueryClient();
    await client.query(
      studentQueries.list(undefined, { limit: 12, before: "previous-page" }),
    );

    expect(fetch).toHaveBeenCalledWith(
      "/api/students?limit=12&before=previous-page",
      expect.any(Object),
    );
  });
});
