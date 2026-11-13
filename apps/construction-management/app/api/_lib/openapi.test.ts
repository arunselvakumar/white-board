import { StatusCodes } from "http-status-codes";
import { describe, expect, it } from "vitest";
import { z } from "zod";

import { buildOpenApiDocument } from "./openapi";

const commaSeparated = z
  .string()
  .transform((value) => value.split(","))
  .pipe(z.array(z.enum(["planned", "missed"])));

describe("query parameters in /api/docs", () => {
  it("documents an array as one comma-separated value, others as they are", () => {
    const doc = buildOpenApiDocument(
      [
        {
          method: "get",
          path: "/api/things",
          summary: "Things",
          tags: ["Things"],
          query: z.object({
            status: commaSeparated.optional(),
            from: z.iso.date().optional(),
          }),
          successStatus: StatusCodes.OK,
          successDescription: "Things",
          errors: [],
        },
      ],
      {},
    );
    const parameters = doc.paths["/api/things"]?.["get"]?.[
      "parameters"
    ] as Record<string, unknown>[];
    const status = parameters.find(
      (parameter) => parameter["name"] === "status",
    );
    const from = parameters.find((parameter) => parameter["name"] === "from");
    expect(status).toMatchObject({
      in: "query",
      style: "form",
      explode: false,
      schema: { type: "array" },
    });
    expect(from).not.toHaveProperty("style");
    expect(from).not.toHaveProperty("explode");
  });
});
