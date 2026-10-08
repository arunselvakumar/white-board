import { QueryClient } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";

import { batchQueries } from "./batches";
import { courseQueries } from "./courses";

afterEach(() => vi.unstubAllGlobals());

function stubFetch() {
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
  return fetch;
}

describe("catalog pagination", () => {
  it("requests the next Course page", async () => {
    const fetch = stubFetch();
    await new QueryClient().query(
      courseQueries.list({ limit: 12, after: "next" }),
    );
    expect(fetch).toHaveBeenCalledWith(
      "/api/training-institute/courses?limit=12&after=next",
      expect.any(Object),
    );
  });

  it("requests the previous Batch page within a Course filter", async () => {
    const fetch = stubFetch();
    await new QueryClient().query(
      batchQueries.list({
        courseId: "course-1",
        limit: 12,
        before: "previous",
      }),
    );
    expect(fetch).toHaveBeenCalledWith(
      "/api/training-institute/batches?limit=12&courseId=course-1&before=previous",
      expect.any(Object),
    );
  });
});
