import { describe, expect, it } from "vitest";

import {
  destinationForRole,
  isAllowedAppPath,
  isOwnerRole,
} from "./workspace-access";

describe("Workspace role access", () => {
  it("keeps the existing app for the Owner only", () => {
    expect(isOwnerRole("org:admin")).toBe(true);
    expect(isOwnerRole("org:member")).toBe(false);
    expect(isAllowedAppPath("/students/new", "org:student")).toBe(false);
    expect(isAllowedAppPath("/fees", "org:parent")).toBe(false);
    expect(isAllowedAppPath("/students/new", "org:admin")).toBe(true);
    expect(isAllowedAppPath("/enrollments/123", "org:parent")).toBe(false);
    expect(isAllowedAppPath("/payments/123/receipt", "org:student")).toBe(
      false,
    );
  });

  it("allows each invited role its own Hello world page", () => {
    expect(isAllowedAppPath("/student", "org:student")).toBe(true);
    expect(isAllowedAppPath("/parent", "org:parent")).toBe(true);
    expect(isAllowedAppPath("/parent", "org:student")).toBe(false);
    expect(isAllowedAppPath("/student", "org:parent")).toBe(false);
    expect(destinationForRole("org:student")).toBe("/student");
    expect(destinationForRole("org:parent")).toBe("/parent");
  });

  it("keeps Teachers on My Batches and outside Owner routes", () => {
    expect(destinationForRole("org:teacher")).toBe("/teacher");
    expect(isAllowedAppPath("/teacher", "org:teacher")).toBe(true);
    expect(isAllowedAppPath("/teachers", "org:teacher")).toBe(false);
    expect(isAllowedAppPath("/students", "org:teacher")).toBe(false);
    expect(isAllowedAppPath("/teacher", "org:admin")).toBe(false);
  });

  it("lets the Owner and Teachers work Enquiries, and keeps Students and Parents out", () => {
    const staffPaths = [
      "/enquiries",
      "/enquiries/new",
      "/enquiries/3f0c2a52-1d7e-4c55-9d8e-0b8a4e6f5a10",
      "/enquiries/3f0c2a52-1d7e-4c55-9d8e-0b8a4e6f5a10/edit",
    ];
    for (const path of staffPaths) {
      expect(isAllowedAppPath(path, "org:admin")).toBe(true);
      expect(isAllowedAppPath(path, "org:teacher")).toBe(true);
      expect(isAllowedAppPath(path, "org:student")).toBe(false);
      expect(isAllowedAppPath(path, "org:parent")).toBe(false);
      expect(isAllowedAppPath(path, "org:member")).toBe(false);
    }
  });

  it("keeps Enquiry Sources, the summary, and Convert to Student for the Owner", () => {
    const ownerPaths = [
      "/enquiries/sources",
      "/enquiries/summary",
      "/enquiries/3f0c2a52-1d7e-4c55-9d8e-0b8a4e6f5a10/convert",
    ];
    for (const path of ownerPaths) {
      expect(isAllowedAppPath(path, "org:admin")).toBe(true);
      expect(isAllowedAppPath(path, "org:teacher")).toBe(false);
      expect(isAllowedAppPath(path, "org:student")).toBe(false);
      expect(isAllowedAppPath(path, "org:parent")).toBe(false);
    }
  });

  it("does not read Owner-only Enquiry pages as an Enquiry id", () => {
    expect(isAllowedAppPath("/enquiries/sources/edit", "org:teacher")).toBe(
      false,
    );
    expect(isAllowedAppPath("/enquiries/summary/edit", "org:teacher")).toBe(
      false,
    );
    expect(isAllowedAppPath("/enquiries/new/edit", "org:teacher")).toBe(false);
  });

  it("lets every supported role open shared Calendar, Online Classes, and class routes", () => {
    for (const role of [
      "org:admin",
      "org:teacher",
      "org:student",
      "org:parent",
    ]) {
      expect(isAllowedAppPath("/calendar", role)).toBe(true);
      expect(isAllowedAppPath("/online-classes", role)).toBe(true);
      expect(isAllowedAppPath("/classes/batch/2026-09-30/09%3A00", role)).toBe(
        true,
      );
    }
    expect(isAllowedAppPath("/calendar", "org:member")).toBe(false);
    expect(isAllowedAppPath("/online-classes", "org:member")).toBe(false);
    expect(
      isAllowedAppPath("/classes/batch/2026-09-30/09%3A00", "org:member"),
    ).toBe(false);
    expect(isAllowedAppPath("/calendar/private", "org:student")).toBe(false);
  });
});
