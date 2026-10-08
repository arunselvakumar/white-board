import { describe, expect, it } from "vitest";

import { openApiDocument } from "./openapi-document";

describe("openApiDocument", () => {
  it("documents the read-only Calendar for every role", () => {
    expect(
      openApiDocument.paths["/api/training-institute/calendar"]?.["get"],
    ).toBeDefined();
    expect(
      openApiDocument.paths["/api/training-institute/calendar"]?.["post"],
    ).toBeUndefined();
  });
  it("documents class access, recording downloads, and provider webhooks", () => {
    const path = "/api/training-institute/classes/{batchId}/{date}/{startTime}";
    expect(openApiDocument.paths[path]?.["get"]).toBeDefined();
    expect(openApiDocument.paths[`${path}/start`]?.["post"]).toBeDefined();
    expect(openApiDocument.paths[`${path}/join`]?.["post"]).toBeDefined();
    expect(openApiDocument.paths[`${path}/recording`]?.["get"]).toBeDefined();
    expect(
      openApiDocument.paths["/api/webhooks/realtimekit"]?.["post"],
    ).toBeDefined();
  });
  it("documents the Student and Parent Home", () => {
    expect(
      openApiDocument.paths["/api/training-institute/home"]?.["get"],
    ).toBeDefined();
  });
  it("documents Tests for staff and published results for families", () => {
    const paths = openApiDocument.paths;
    const base = "/api/training-institute";
    expect(paths[`${base}/batches/{id}/tests`]?.["get"]).toBeDefined();
    expect(paths[`${base}/batches/{id}/tests`]?.["post"]).toBeDefined();
    expect(paths[`${base}/tests/{id}`]?.["get"]).toBeDefined();
    for (const action of ["update", "results", "publish", "delete"])
      expect(paths[`${base}/tests/{id}/${action}`]?.["post"]).toBeDefined();
    expect(paths[`${base}/students/{id}/tests`]?.["get"]).toBeDefined();
    expect(paths[`${base}/home/results`]?.["get"]).toBeDefined();
  });
  it("does not document Todo routes", () => {
    const paths = openApiDocument.paths;
    expect(paths["/api/todos"]).toBeUndefined();
  });

  it("documents Student admit, list, get, profile, and drop", () => {
    const paths = openApiDocument.paths;
    expect(paths["/api/training-institute/students"]?.["post"]).toBeDefined();
    expect(paths["/api/training-institute/students"]?.["get"]).toBeDefined();
    expect(
      paths["/api/training-institute/students/{id}"]?.["get"],
    ).toBeDefined();
    expect(
      paths["/api/training-institute/students/{id}/profile"]?.["post"],
    ).toBeDefined();
    expect(
      paths["/api/training-institute/students/{id}/drop"]?.["post"],
    ).toBeDefined();
  });

  it("documents Batch create, list, get, schedule, and close", () => {
    const paths = openApiDocument.paths;
    expect(paths["/api/training-institute/batches"]?.["post"]).toBeDefined();
    expect(paths["/api/training-institute/batches"]?.["get"]).toBeDefined();
    expect(
      paths["/api/training-institute/batches/{id}"]?.["get"],
    ).toBeDefined();
    expect(
      paths["/api/training-institute/batches/{id}/schedule"]?.["post"],
    ).toBeDefined();
    expect(
      paths["/api/training-institute/batches/{id}/close"]?.["post"],
    ).toBeDefined();
  });

  it("documents Enrollment and Fee routes", () => {
    const paths = openApiDocument.paths;
    expect(
      paths["/api/training-institute/enrollments"]?.["post"],
    ).toBeDefined();
    expect(
      paths["/api/training-institute/enrollments/{id}"]?.["get"],
    ).toBeDefined();
    expect(
      paths["/api/training-institute/enrollments/{id}/mode"]?.["post"],
    ).toBeDefined();
    expect(
      paths["/api/training-institute/enrollments/{id}/timings"]?.["post"],
    ).toBeDefined();
    expect(
      paths["/api/training-institute/enrollments/{id}/move"]?.["post"],
    ).toBeDefined();
    expect(
      paths["/api/training-institute/enrollments/{id}/end"]?.["post"],
    ).toBeDefined();
    expect(
      paths["/api/training-institute/enrollments/{id}/fee-plan"]?.["post"],
    ).toBeDefined();
    expect(
      paths["/api/training-institute/enrollments/{id}/payments"]?.["post"],
    ).toBeDefined();
    expect(
      paths["/api/training-institute/enrollments/{id}/payments"]?.["get"],
    ).toBeDefined();
    expect(
      paths["/api/training-institute/payments/{id}/receipt"]?.["get"],
    ).toBeDefined();
    expect(paths["/api/training-institute/dashboard"]?.["get"]).toBeDefined();
  });

  it("documents Course create, list, get, update, and archive", () => {
    const paths = openApiDocument.paths;
    expect(paths["/api/training-institute/courses"]?.["post"]).toBeDefined();
    expect(paths["/api/training-institute/courses"]?.["get"]).toBeDefined();
    expect(
      paths["/api/training-institute/courses/{id}"]?.["get"],
    ).toBeDefined();
    expect(
      paths["/api/training-institute/courses/{id}/update"]?.["post"],
    ).toBeDefined();
    expect(
      paths["/api/training-institute/courses/{id}/archive"]?.["post"],
    ).toBeDefined();
  });

  it("documents Teacher management and My Batches", () => {
    const paths = openApiDocument.paths;
    expect(paths["/api/training-institute/teachers"]?.["post"]).toBeDefined();
    expect(paths["/api/training-institute/teachers"]?.["get"]).toBeDefined();
    expect(
      paths["/api/training-institute/teachers/{id}"]?.["get"],
    ).toBeDefined();
    expect(
      paths["/api/training-institute/teachers/{id}/profile"]?.["post"],
    ).toBeDefined();
    expect(
      paths["/api/training-institute/teachers/{id}/invite"]?.["post"],
    ).toBeDefined();
    expect(
      paths["/api/training-institute/teachers/{id}/deactivate"]?.["post"],
    ).toBeDefined();
    expect(
      paths["/api/training-institute/teachers/{id}/batches"]?.["get"],
    ).toBeDefined();
    expect(
      paths["/api/training-institute/teachers/{id}/batches"]?.["post"],
    ).toBeDefined();
    expect(
      paths[
        "/api/training-institute/teachers/{id}/batches/{batchId}/unassign"
      ]?.["post"],
    ).toBeDefined();
    expect(
      paths["/api/training-institute/teachers/{id}/photo"]?.["get"]?.[
        "responses"
      ],
    ).toMatchObject({
      "200": {
        content: {
          "image/jpeg": { schema: { type: "string", format: "binary" } },
        },
      },
    });
    expect(
      paths["/api/training-institute/teachers/{id}/documents"]?.["get"],
    ).toBeDefined();
    expect(
      paths["/api/training-institute/teachers/{id}/documents"]?.["post"],
    ).toBeDefined();
    expect(
      paths["/api/training-institute/teachers/{id}/documents/{documentId}"]?.[
        "get"
      ]?.["responses"],
    ).toMatchObject({
      "200": {
        content: {
          "application/pdf": { schema: { type: "string", format: "binary" } },
        },
      },
    });
    expect(
      paths[
        "/api/training-institute/teachers/{id}/documents/{documentId}/remove"
      ]?.["post"],
    ).toBeDefined();
    expect(
      paths["/api/training-institute/teacher/activate"]?.["post"],
    ).toBeDefined();
    expect(
      paths["/api/training-institute/teacher/batches"]?.["get"],
    ).toBeDefined();
  });

  it("documents Attendance registers, marks, and Student history", () => {
    const paths = openApiDocument.paths;
    expect(
      paths["/api/training-institute/attendance/registers"]?.["post"],
    ).toBeDefined();
    expect(
      paths["/api/training-institute/attendance/registers"]?.["get"],
    ).toBeDefined();
    expect(
      paths["/api/training-institute/attendance/registers/{id}"]?.["get"],
    ).toBeDefined();
    expect(
      paths["/api/training-institute/attendance/registers/{id}/marks"]?.[
        "post"
      ],
    ).toBeDefined();
    expect(
      paths["/api/training-institute/students/{id}/attendance"]?.["get"],
    ).toBeDefined();
  });

  it("documents Enquiries, demos, and Enquiry Sources", () => {
    const paths = openApiDocument.paths;
    const base = "/api/training-institute";
    const expected: [string, string][] = [
      ["get", "/enquiries"],
      ["post", "/enquiries"],
      ["get", "/enquiries/options"],
      ["get", "/enquiries/summary"],
      ["post", "/enquiries/phone-matches"],
      ["get", "/enquiries/{id}"],
      ["post", "/enquiries/{id}/details"],
      ["post", "/enquiries/{id}/follow-ups"],
      ["post", "/enquiries/{id}/not-interested"],
      ["post", "/enquiries/{id}/reopen"],
      ["post", "/enquiries/{id}/convert"],
      ["post", "/enquiries/{id}/demos"],
      ["get", "/demos"],
      ["get", "/demos/slots"],
      ["post", "/demos/{id}/attendance"],
      ["post", "/demos/{id}/fee-paid"],
      ["post", "/demos/{id}/cancel"],
      ["get", "/enquiry-sources"],
      ["post", "/enquiry-sources"],
      ["post", "/enquiry-sources/{id}/rename"],
      ["post", "/enquiry-sources/{id}/retire"],
      ["post", "/enquiry-sources/{id}/restore"],
    ];
    for (const [method, path] of expected) {
      expect(
        paths[`${base}${path}`]?.[method],
        `${method} ${path}`,
      ).toBeDefined();
    }
    expect(paths[`${base}/enquiries/{id}`]?.["patch"]).toBeUndefined();
  });

  it("documents Homework, Study Material, Submissions, and files (ADR-0033)", () => {
    const paths = openApiDocument.paths;
    const base = "/api/training-institute";
    const expected: [string, string][] = [
      ["get", "/batches/{id}/class-work"],
      ["post", "/batches/{id}/study-materials"],
      ["post", "/study-materials/{id}/update"],
      ["post", "/study-materials/{id}/remove"],
      ["post", "/batches/{id}/homework"],
      ["post", "/homework/{id}/update"],
      ["post", "/homework/{id}/remove"],
      ["get", "/homework/{id}/submissions"],
      ["post", "/homework/{id}/submissions/{submissionId}/check"],
      ["get", "/home/homework"],
      ["post", "/homework/{id}/submit"],
      ["post", "/homework/{id}/undo-submission"],
      ["post", "/attachments"],
      ["get", "/attachments/{id}"],
    ];
    for (const [method, path] of expected) {
      expect(
        paths[`${base}${path}`]?.[method],
        `${method} ${path}`,
      ).toBeDefined();
    }
    expect(paths[`${base}/attachments`]?.["post"]).toMatchObject({
      requestBody: {
        content: {
          "application/pdf": { schema: { type: "string", format: "binary" } },
          "image/png": { schema: { type: "string", format: "binary" } },
        },
      },
    });
    expect(
      paths[`${base}/attachments/{id}`]?.["get"]?.["responses"],
    ).toMatchObject({
      "200": { content: { "image/jpeg": { schema: { format: "binary" } } } },
    });
  });

  it("names every component with its bounded context (ADR-0030)", () => {
    const names = Object.keys(openApiDocument.components.schemas);
    expect(names).toContain("CreateTrainingInstituteStudentRequest");
    expect(names).toContain("GetTrainingInstituteStudentResponse");
    const unqualified = names.filter(
      (name) => name !== "ErrorResponse" && !name.includes("TrainingInstitute"),
    );
    expect(unqualified).toEqual([]);
  });

  it("refers to components instead of inlining body and response schemas", () => {
    const post = openApiDocument.paths["/api/training-institute/students"]?.[
      "post"
    ] as {
      requestBody: { content: Record<string, { schema: unknown }> };
      responses: Record<
        string,
        { content: Record<string, { schema: unknown }> }
      >;
    };
    expect(post.requestBody.content["application/json"]?.schema).toEqual({
      $ref: "#/components/schemas/CreateTrainingInstituteStudentRequest",
    });
    expect(post.responses["201"]?.content["application/json"]?.schema).toEqual({
      $ref: "#/components/schemas/CreateTrainingInstituteStudentResponse",
    });
    expect(post.responses["401"]?.content["application/json"]?.schema).toEqual({
      $ref: "#/components/schemas/ErrorResponse",
    });
  });

  it("serves Training Institute resources under their context prefix", () => {
    const outside = Object.keys(openApiDocument.paths).filter(
      (path) =>
        !path.startsWith("/api/training-institute/") &&
        !path.startsWith("/api/webhooks/"),
    );
    expect(outside).toEqual([]);
  });
});
