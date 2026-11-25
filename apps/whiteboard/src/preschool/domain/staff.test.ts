import { describe, expect, it } from "vitest";

import {
  assertClassroomsAllowed,
  assertMayManageStaffRole,
  canSignIn,
  staffEmail,
  staffName,
} from "./staff";

describe("staff rules", () => {
  it("lets Centre Heads and Teachers sign in, not helpers", () => {
    expect(canSignIn("centre_head")).toBe(true);
    expect(canSignIn("teacher")).toBe(true);
    expect(canSignIn("helper")).toBe(false);
  });

  it("lower-cases the email and treats blank as none", () => {
    expect(staffEmail("  Asha@Example.COM ")).toBe("asha@example.com");
    expect(staffEmail(" ")).toBeNull();
    expect(staffEmail(null)).toBeNull();
    expect(() => staffEmail("not-an-email")).toThrow(
      expect.objectContaining({ code: "STAFF_EMAIL_INVALID" }),
    );
  });

  it("trims the name and refuses an empty one", () => {
    expect(staffName("  Asha   Rao ")).toBe("Asha Rao");
    expect(() => staffName("")).toThrow(
      expect.objectContaining({ code: "STAFF_NAME_REQUIRED" }),
    );
  });

  it("leaves Centre Heads to the Owner", () => {
    expect(() => {
      assertMayManageStaffRole(false, "teacher");
    }).not.toThrow();
    expect(() => {
      assertMayManageStaffRole(true, "centre_head");
    }).not.toThrow();
    expect(() => {
      assertMayManageStaffRole(false, "teacher", "centre_head");
    }).toThrow(
      expect.objectContaining({
        kind: "forbidden",
        code: "CENTRE_HEAD_OWNER_ONLY",
      }),
    );
  });

  it("keeps helpers out of Classrooms", () => {
    expect(() => {
      assertClassroomsAllowed("helper", ["c"]);
    }).toThrow(expect.objectContaining({ code: "CLASS_TEACHER_ROLE" }));
    expect(() => {
      assertClassroomsAllowed("helper", []);
    }).not.toThrow();
    expect(() => {
      assertClassroomsAllowed("teacher", ["c"]);
    }).not.toThrow();
  });
});
