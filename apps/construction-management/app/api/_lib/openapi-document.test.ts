import { describe, expect, it } from "vitest";

describe("The OpenAPI document", () => {
  // `next build` collects /api/openapi.json, so a model the document cannot
  // show (a `.transform`, for one) fails the build, not only /api/docs.
  it("builds from every registered model", async () => {
    const { openApiDocument } = await import("./openapi-document");
    expect(Object.keys(openApiDocument.paths)).toContain(
      "/api/construction/marketing/companies",
    );
  }, 30_000); // Importing every model takes a few seconds.
});
