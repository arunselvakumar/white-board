import { describe, expect, it } from "vitest";

import { BatchId } from "./batch-id";
import { CourseId } from "./course-id";
import { EnrollmentId } from "./enrollment-id";
import { DomainError } from "./errors";
import { FeePaymentId } from "./fee-payment-id";
import { StudentId } from "./student-id";
import { UserId } from "./user-id";
import { WorkspaceId } from "./workspace-id";

const UUID = "550e8400-e29b-41d4-a716-446655440000";

describe("WorkspaceId", () => {
  it("trims a Clerk id", () => {
    expect(WorkspaceId.create("  org_1  ").value).toBe("org_1");
  });

  it("rejects an empty id", () => {
    expect(() => WorkspaceId.create("   ")).toThrow(DomainError);
    try {
      WorkspaceId.create("");
    } catch (error) {
      expect(error).toBeInstanceOf(DomainError);
      expect((error as DomainError).code).toBe("WORKSPACE_ID_REQUIRED");
    }
  });
});

describe("UserId", () => {
  it("trims a Clerk id", () => {
    expect(UserId.create("  user_1  ").value).toBe("user_1");
  });

  it("rejects an empty id", () => {
    expect(() => UserId.create("")).toThrow(DomainError);
  });
});

describe("resource ids", () => {
  it("accepts a UUID and lowercases it", () => {
    expect(CourseId.create(UUID.toUpperCase()).value).toBe(UUID);
    expect(BatchId.create(UUID).equals(BatchId.create(UUID))).toBe(true);
    expect(StudentId.create(UUID).value).toBe(UUID);
    expect(EnrollmentId.create(UUID).value).toBe(UUID);
    expect(FeePaymentId.create(UUID).value).toBe(UUID);
  });

  it("rejects a non-UUID", () => {
    expect(() => CourseId.create("not-a-uuid")).toThrow(DomainError);
    try {
      CourseId.create("org_1");
    } catch (error) {
      expect(error).toBeInstanceOf(DomainError);
      expect((error as DomainError).code).toBe("COURSE_ID_INVALID");
    }
  });
});
