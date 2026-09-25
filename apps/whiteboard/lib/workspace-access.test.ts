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

  it("lets every supported role open only the shared Calendar route", () => {
    for (const role of ["org:admin", "org:teacher", "org:student", "org:parent"]) {
      expect(isAllowedAppPath("/calendar", role)).toBe(true);
    }
    expect(isAllowedAppPath("/calendar", "org:member")).toBe(false);
    expect(isAllowedAppPath("/calendar/private", "org:student")).toBe(false);
  });
});
