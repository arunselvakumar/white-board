import { describe, expect, it } from "vitest";

import {
  STAFF_ROLES_SECTIONS,
  activeStaffRolesSection,
  rolePath,
  staffPath,
} from "./staff-roles-nav";

describe("STAFF_ROLES_SECTIONS", () => {
  it("has Staff, then Role Management", () => {
    expect(STAFF_ROLES_SECTIONS.map((section) => section.label)).toEqual([
      "Staff",
      "Role Management",
    ]);
    expect(STAFF_ROLES_SECTIONS.map((section) => section.href)).toEqual([
      "/app/staff",
      "/app/roles",
    ]);
  });

  it("finds the section a page belongs to", () => {
    expect(activeStaffRolesSection("/app/staff")?.label).toBe("Staff");
    expect(activeStaffRolesSection("/app/staff/new")?.label).toBe("Staff");
    expect(activeStaffRolesSection(staffPath("u1"))?.label).toBe("Staff");
    expect(activeStaffRolesSection(rolePath("r1"))?.label).toBe(
      "Role Management",
    );
    expect(activeStaffRolesSection("/app/staffx")).toBeUndefined();
    expect(activeStaffRolesSection("/app/masters")).toBeUndefined();
  });
});
