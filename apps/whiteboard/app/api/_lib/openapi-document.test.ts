import { describe, expect, it } from "vitest";

import { openApiDocument } from "./openapi-document";

describe("openApiDocument", () => {
  it("documents every todo route from Zod models", () => {
    const paths = openApiDocument.paths;
    expect(paths["/api/todos"]?.["post"]).toBeDefined();
    expect(paths["/api/todos"]?.["get"]).toBeDefined();
    expect(paths["/api/todos/{id}"]?.["get"]).toBeDefined();
    expect(paths["/api/todos/{id}"]?.["delete"]).toBeDefined();
    expect(paths["/api/todos/{id}/complete"]?.["post"]).toBeDefined();
  });
});
