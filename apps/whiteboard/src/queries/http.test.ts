import { afterEach, describe, expect, it, vi } from "vitest";

import { apiJson } from "./http";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("apiJson", () => {
  it("returns JSON when the response is ok", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve(
          new Response(JSON.stringify({ id: "stu_1" }), {
            status: 200,
            headers: { "content-type": "application/json" },
          }),
        ),
      ),
    );

    await expect(apiJson<{ id: string }>("/api/students/stu_1")).resolves.toEqual(
      { id: "stu_1" },
    );
  });

  it("throws QueryHttpError with the API envelope on failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve(
          new Response(
            JSON.stringify({
              code: "not_found",
              message: "Student not found",
            }),
            {
              status: 404,
              statusText: "Not Found",
              headers: { "content-type": "application/json" },
            },
          ),
        ),
      ),
    );

    await expect(apiJson("/api/students/missing")).rejects.toMatchObject({
      name: "QueryHttpError",
      status: 404,
      code: "not_found",
      message: "Student not found",
    });
  });
});
