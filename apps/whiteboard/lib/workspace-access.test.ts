import { WORKSPACE_ROLES } from "@repo/auth/roles";
import { describe, expect, it } from "vitest";

import {
  destinationForRole,
  isAllowedAppPath,
  isAllowedPreschoolPath,
  isOwnerRole,
  mustLeaveAppPath,
  preschoolHomeFor,
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
    expect(isAllowedAppPath("/batches/b1/tests", "owner")).toBe(true);
    expect(isAllowedAppPath("/batches/b1/tests/t1", "owner")).toBe(true);
    expect(isAllowedAppPath("/batches/b1/tests", "teacher")).toBe(false);
    expect(isAllowedAppPath("/teacher/batches/b1/tests", "teacher")).toBe(true);
    expect(isAllowedAppPath("/teacher/batches/b1/tests/t1", "teacher")).toBe(
      true,
    );
    expect(isAllowedAppPath("/teacher/batches/b1/students/s1", "teacher")).toBe(
      true,
    );
    expect(isAllowedAppPath("/teacher/batches/b1/tests", "student")).toBe(
      false,
    );
    expect(isAllowedAppPath("/student/results", "student")).toBe(true);
    expect(isAllowedAppPath("/student/results", "parent")).toBe(false);
    expect(isAllowedAppPath("/parent/results", "parent")).toBe(true);
    expect(isAllowedAppPath("/parent/results", "owner")).toBe(false);
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

describe("Absence Notices and Notifications (ADR-0041)", () => {
  it.each([
    ["owner", "/absence-notices", false],
    ["teacher", "/absence-notices", true],
    ["student", "/absence-notices", true],
    ["parent", "/absence-notices", true],
    ["teacher", "/teacher/absence-notices", false],
    ["owner", "/teacher/absence-notices", true],
    ["student", "/teacher/absence-notices", true],
    ["teacher", "/notifications", false],
    ["owner", "/notifications", true],
    ["student", "/notifications", true],
    ["parent", "/notifications", true],
  ] as const)("gates %s on %s", (role, path, leave) => {
    expect(mustLeaveAppPath(path, role)).toBe(leave);
  });
});

describe("Workspace Gate role redirect", () => {
  it.each(["student", "parent"] as const)(
    "sends %s away from Add Student",
    (role) => {
      expect(mustLeaveAppPath("/students/new", role)).toBe(true);
    },
  );

  it("lets the Owner open Add Student", () => {
    expect(mustLeaveAppPath("/students/new", "owner")).toBe(false);
  });

  it("keeps each Home within its role", () => {
    expect(mustLeaveAppPath("/student", "student")).toBe(false);
    expect(mustLeaveAppPath("/parent", "student")).toBe(true);
  });

  it("never redirects from the In-app Home or ungated screens", () => {
    for (const role of WORKSPACE_ROLES) {
      expect(mustLeaveAppPath("/", role)).toBe(false);
      expect(mustLeaveAppPath("/online-classes", role)).toBe(false);
    }
  });

  it.each([
    ["teacher", "/enquiries", false],
    ["teacher", "/enquiries/new", false],
    ["teacher", "/enquiries/abc", false],
    ["teacher", "/enquiries/abc/edit", false],
    ["teacher", "/enquiries/sources", true],
    ["teacher", "/enquiries/summary", true],
    ["teacher", "/enquiries/abc/convert", true],
    ["owner", "/enquiries/sources", false],
    ["owner", "/enquiries/summary", false],
    ["owner", "/enquiries/abc/convert", false],
    ["student", "/enquiries", true],
    ["parent", "/enquiries/abc", true],
  ] as const)("gates %s on %s", (role, path, leave) => {
    expect(mustLeaveAppPath(path, role)).toBe(leave);
  });
});

describe("Reports", () => {
  it.each([
    ["owner", "/reports", false],
    ["teacher", "/reports", false],
    ["student", "/reports", false],
    ["parent", "/reports", false],
    ["owner", "/reports/settings", false],
    ["teacher", "/reports/settings", true],
    ["parent", "/reports/settings", true],
    ["owner", "/reports/dues", false],
    ["teacher", "/reports/dues", true],
    ["teacher", "/reports/attendance-register", false],
    ["student", "/reports/attendance-register", true],
    ["student", "/reports/student-attendance", false],
    ["parent", "/reports/monthly-student", false],
    ["owner", "/reports/not-a-report", true],
  ] as const)("gates %s on %s", (role, path, leave) => {
    expect(mustLeaveAppPath(path, role)).toBe(leave);
  });
});

describe("Screens by Institution Type (ADR-0055)", () => {
  it("keeps a Preschool Workspace on the In-app Home and /preschool", () => {
    for (const role of WORKSPACE_ROLES) {
      expect(mustLeaveAppPath("/", role, "preschool")).toBe(false);
      expect(mustLeaveAppPath("/preschool", role, "preschool")).toBe(false);
      expect(
        mustLeaveAppPath("/preschool/centres/abc", role, "preschool"),
      ).toBe(false);
      expect(mustLeaveAppPath("/students", role, "preschool")).toBe(true);
      expect(mustLeaveAppPath("/calendar", role, "preschool")).toBe(true);
      expect(mustLeaveAppPath("/notifications", role, "preschool")).toBe(true);
      expect(mustLeaveAppPath("/teacher", role, "preschool")).toBe(true);
    }
    expect(mustLeaveAppPath("/preschoolers", "owner", "preschool")).toBe(true);
  });

  it("closes /preschool to a Training Institute, with or without a type", () => {
    expect(mustLeaveAppPath("/preschool", "owner", "training_institute")).toBe(
      true,
    );
    expect(mustLeaveAppPath("/preschool/family", "parent")).toBe(true);
    expect(mustLeaveAppPath("/students", "owner", "training_institute")).toBe(
      false,
    );
    expect(mustLeaveAppPath("/students", "parent", "training_institute")).toBe(
      true,
    );
  });
});

describe("Preschool role access", () => {
  it("sends each Preschool role to its own Home", () => {
    expect(preschoolHomeFor("owner")).toBe("/preschool");
    expect(preschoolHomeFor("centre_head")).toBe("/preschool");
    expect(preschoolHomeFor("teacher")).toBe("/preschool/teacher");
    expect(preschoolHomeFor("parent")).toBe("/preschool/family");
  });

  it("lets each role open its own Home only", () => {
    for (const role of ["owner", "centre_head", "teacher", "parent"] as const)
      expect(isAllowedPreschoolPath(preschoolHomeFor(role), role)).toBe(true);
    expect(isAllowedPreschoolPath("/preschool/teacher", "owner")).toBe(false);
    expect(isAllowedPreschoolPath("/preschool/family", "owner")).toBe(false);
    expect(isAllowedPreschoolPath("/preschool/family", "teacher")).toBe(false);
    expect(isAllowedPreschoolPath("/preschool", "teacher")).toBe(false);
    expect(isAllowedPreschoolPath("/preschool", "parent")).toBe(false);
  });

  it("gives the Owner every Head Office screen", () => {
    for (const path of [
      "/preschool/head-office",
      "/preschool/head-office/royalty",
      "/preschool/head-office/royalty/abc",
      "/preschool/centres",
      "/preschool/centres/new",
      "/preschool/programmes",
      "/preschool/fees/structures",
      "/preschool/stock/items",
      "/preschool/fees",
      "/preschool/children/abc",
    ])
      expect(isAllowedPreschoolPath(path, "owner")).toBe(true);
  });

  it("keeps a Centre Head inside the Centre", () => {
    for (const path of [
      "/preschool/head-office",
      "/preschool/head-office/royalty",
      "/preschool/head-office/royalty/abc",
      "/preschool/centres",
      "/preschool/centres/abc",
      "/preschool/programmes",
      "/preschool/stock/items",
    ])
      expect(isAllowedPreschoolPath(path, "centre_head")).toBe(false);
    for (const path of [
      "/preschool/fees",
      "/preschool/fees/structures",
      "/preschool/fees/children/abc",
      "/preschool/fees/receipts/abc",
      "/preschool/fees/dues",
      "/preschool/stock",
      "/preschool/staff",
      "/preschool/enquiries",
      "/preschool/enquiries/new",
      "/preschool/children/new",
      "/preschool/classrooms",
    ])
      expect(isAllowedPreschoolPath(path, "centre_head")).toBe(true);
  });

  it("keeps a Teacher away from fees and masters", () => {
    for (const path of [
      "/preschool/fees",
      "/preschool/fees/structures",
      "/preschool/fees/receipts/abc",
      "/preschool/centres",
      "/preschool/staff",
      "/preschool/head-office",
      "/preschool/programmes",
      "/preschool/stock",
      "/preschool/enquiries/abc",
      "/preschool/children/new",
    ])
      expect(isAllowedPreschoolPath(path, "teacher")).toBe(false);
    for (const path of [
      "/preschool/attendance",
      "/preschool/daily-reports",
      "/preschool/children",
      "/preschool/children/abc",
      "/preschool/progress",
      "/preschool/announcements",
    ])
      expect(isAllowedPreschoolPath(path, "teacher")).toBe(true);
  });

  it("gives a Parent only the family area", () => {
    expect(
      isAllowedPreschoolPath("/preschool/family/announcements", "parent"),
    ).toBe(true);
    expect(isAllowedPreschoolPath("/preschool/announcements", "parent")).toBe(
      false,
    );
    expect(isAllowedPreschoolPath("/preschool/children", "parent")).toBe(false);
    for (const path of [
      "/preschool/family/daily-reports",
      "/preschool/family/attendance",
      "/preschool/family/fees",
      "/preschool/family/receipts/abc",
      "/preschool/family/child",
      "/preschool/family/progress",
    ]) {
      expect(isAllowedPreschoolPath(path, "parent")).toBe(true);
      for (const role of ["owner", "centre_head", "teacher"] as const)
        expect(isAllowedPreschoolPath(path, role)).toBe(false);
    }
    expect(
      isAllowedPreschoolPath("/preschool/fees/receipts/abc", "parent"),
    ).toBe(false);
    expect(isAllowedPreschoolPath("/students", "parent")).toBe(false);
  });
});
