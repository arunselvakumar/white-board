import { WORKSPACE_ROLES } from "@repo/auth/roles";
import { describe, expect, it } from "vitest";

import {
  destinationForRole,
  isAllowedAppPath,
  isOwnerRole,
} from "./workspace-access";

describe("Workspace role access", () => {
  it("keeps the existing app for the Owner only", () => {
    expect(isOwnerRole("owner")).toBe(true);
    expect(isOwnerRole(null)).toBe(false);
    expect(isAllowedAppPath("/students/new", "student")).toBe(false);
    expect(isAllowedAppPath("/fees", "parent")).toBe(false);
    expect(isAllowedAppPath("/students/new", "owner")).toBe(true);
    expect(isAllowedAppPath("/enrollments/123", "parent")).toBe(false);
    expect(isAllowedAppPath("/payments/123/receipt", "student")).toBe(false);
  });

  it("allows each invited role its own Hello world page", () => {
    expect(isAllowedAppPath("/student", "student")).toBe(true);
    expect(isAllowedAppPath("/parent", "parent")).toBe(true);
    expect(isAllowedAppPath("/parent", "student")).toBe(false);
    expect(isAllowedAppPath("/student", "parent")).toBe(false);
    expect(destinationForRole("student")).toBe("/student");
    expect(destinationForRole("parent")).toBe("/parent");
  });

  it("keeps Teachers on My Batches and outside Owner routes", () => {
    expect(destinationForRole("teacher")).toBe("/teacher");
    expect(isAllowedAppPath("/teacher", "teacher")).toBe(true);
    expect(isAllowedAppPath("/teachers", "teacher")).toBe(false);
    expect(isAllowedAppPath("/students", "teacher")).toBe(false);
    expect(isAllowedAppPath("/teacher", "owner")).toBe(false);
  });

  it("lets the Owner and Teachers work Enquiries, and keeps Students and Parents out", () => {
    const staffPaths = [
      "/enquiries",
      "/enquiries/new",
      "/enquiries/3f0c2a52-1d7e-4c55-9d8e-0b8a4e6f5a10",
      "/enquiries/3f0c2a52-1d7e-4c55-9d8e-0b8a4e6f5a10/edit",
    ];
    for (const path of staffPaths) {
      expect(isAllowedAppPath(path, "owner")).toBe(true);
      expect(isAllowedAppPath(path, "teacher")).toBe(true);
      expect(isAllowedAppPath(path, "student")).toBe(false);
      expect(isAllowedAppPath(path, "parent")).toBe(false);
      expect(isAllowedAppPath(path, null)).toBe(false);
    }
  });

  it("keeps Enquiry Sources, the summary, and Convert to Student for the Owner", () => {
    const ownerPaths = [
      "/enquiries/sources",
      "/enquiries/summary",
      "/enquiries/3f0c2a52-1d7e-4c55-9d8e-0b8a4e6f5a10/convert",
    ];
    for (const path of ownerPaths) {
      expect(isAllowedAppPath(path, "owner")).toBe(true);
      expect(isAllowedAppPath(path, "teacher")).toBe(false);
      expect(isAllowedAppPath(path, "student")).toBe(false);
      expect(isAllowedAppPath(path, "parent")).toBe(false);
    }
  });

  it("does not read Owner-only Enquiry pages as an Enquiry id", () => {
    expect(isAllowedAppPath("/enquiries/sources/edit", "teacher")).toBe(false);
    expect(isAllowedAppPath("/enquiries/summary/edit", "teacher")).toBe(false);
    expect(isAllowedAppPath("/enquiries/new/edit", "teacher")).toBe(false);
  });

  it("lets every supported role open shared Calendar, Online Classes, and class routes", () => {
    for (const role of WORKSPACE_ROLES) {
      expect(isAllowedAppPath("/calendar", role)).toBe(true);
      expect(isAllowedAppPath("/online-classes", role)).toBe(true);
      expect(isAllowedAppPath("/classes/batch/2026-09-30/09%3A00", role)).toBe(
        true,
      );
    }
    expect(isAllowedAppPath("/calendar", null)).toBe(false);
    expect(isAllowedAppPath("/online-classes", null)).toBe(false);
    expect(isAllowedAppPath("/classes/batch/2026-09-30/09%3A00", null)).toBe(
      false,
    );
    expect(isAllowedAppPath("/calendar/private", "student")).toBe(false);
  });

  it("opens Homework and Study Material to the roles that use them (ADR-0033)", () => {
    expect(isAllowedAppPath("/batches/b1/homework", "owner")).toBe(true);
    expect(isAllowedAppPath("/batches/b1/homework/h1", "owner")).toBe(true);
    expect(isAllowedAppPath("/batches/b1/homework", "teacher")).toBe(false);
    expect(isAllowedAppPath("/teacher/batches/b1/homework", "teacher")).toBe(
      true,
    );
    expect(isAllowedAppPath("/teacher/batches/b1/homework/h1", "teacher")).toBe(
      true,
    );
    expect(isAllowedAppPath("/teacher/batches/b1/homework", "student")).toBe(
      false,
    );
    expect(isAllowedAppPath("/student/homework", "student")).toBe(true);
    expect(isAllowedAppPath("/student/homework/h1", "student")).toBe(true);
    expect(isAllowedAppPath("/student/homework", "parent")).toBe(false);
    expect(isAllowedAppPath("/parent/homework", "parent")).toBe(true);
    expect(isAllowedAppPath("/parent/homework/h1", "parent")).toBe(true);
    expect(isAllowedAppPath("/parent/homework", "teacher")).toBe(false);
    expect(isAllowedAppPath("/parent/homework/h1/x", "parent")).toBe(false);
  });
});
