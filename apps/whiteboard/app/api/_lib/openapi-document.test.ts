import { describe, expect, it } from "vitest";

import { openApiDocument } from "./openapi-document";

describe("openApiDocument", () => {
  it("does not document Todo routes", () => {
    const paths = openApiDocument.paths;
    expect(paths["/api/todos"]).toBeUndefined();
  });

  it("documents Student admit, list, get, profile, and drop", () => {
    const paths = openApiDocument.paths;
    expect(paths["/api/students"]?.["post"]).toBeDefined();
    expect(paths["/api/students"]?.["get"]).toBeDefined();
    expect(paths["/api/students/{id}"]?.["get"]).toBeDefined();
    expect(paths["/api/students/{id}/profile"]?.["post"]).toBeDefined();
    expect(paths["/api/students/{id}/drop"]?.["post"]).toBeDefined();
  });

  it("documents Batch create, list, get, schedule, and close", () => {
    const paths = openApiDocument.paths;
    expect(paths["/api/batches"]?.["post"]).toBeDefined();
    expect(paths["/api/batches"]?.["get"]).toBeDefined();
    expect(paths["/api/batches/{id}"]?.["get"]).toBeDefined();
    expect(paths["/api/batches/{id}/schedule"]?.["post"]).toBeDefined();
    expect(paths["/api/batches/{id}/close"]?.["post"]).toBeDefined();
  });

  it("documents Enrollment and Fee routes", () => {
    const paths = openApiDocument.paths;
    expect(paths["/api/enrollments"]?.["post"]).toBeDefined();
    expect(paths["/api/enrollments/{id}"]?.["get"]).toBeDefined();
    expect(paths["/api/enrollments/{id}/mode"]?.["post"]).toBeDefined();
    expect(paths["/api/enrollments/{id}/timings"]?.["post"]).toBeDefined();
    expect(paths["/api/enrollments/{id}/move"]?.["post"]).toBeDefined();
    expect(paths["/api/enrollments/{id}/end"]?.["post"]).toBeDefined();
    expect(paths["/api/enrollments/{id}/fee-plan"]?.["post"]).toBeDefined();
    expect(paths["/api/enrollments/{id}/payments"]?.["post"]).toBeDefined();
    expect(paths["/api/enrollments/{id}/payments"]?.["get"]).toBeDefined();
    expect(paths["/api/payments/{id}/receipt"]?.["get"]).toBeDefined();
    expect(paths["/api/dashboard"]?.["get"]).toBeDefined();
  });

  it("documents Course create, list, get, update, and archive", () => {
    const paths = openApiDocument.paths;
    expect(paths["/api/courses"]?.["post"]).toBeDefined();
    expect(paths["/api/courses"]?.["get"]).toBeDefined();
    expect(paths["/api/courses/{id}"]?.["get"]).toBeDefined();
    expect(paths["/api/courses/{id}/update"]?.["post"]).toBeDefined();
    expect(paths["/api/courses/{id}/archive"]?.["post"]).toBeDefined();
  });
});
