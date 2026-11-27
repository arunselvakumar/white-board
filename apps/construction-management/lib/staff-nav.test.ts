import { describe, expect, it } from "vitest";

import {
  activeStaffSection,
  employeePagePath,
  roleMembersLabel,
  rolePath,
  staffPath,
  staffSections,
} from "./staff-nav";

describe("staffSections", () => {
  it("has Employees, Vendor, Office Staff, then Role Management, all under /app/staff", () => {
    expect(staffSections(true).map((section) => section.label)).toEqual([
      "Employees",
      "Vendor",
      "Office Staff",
      "Role Management",
    ]);
    expect(staffSections(true).map((section) => section.href)).toEqual([
      "/app/staff/employees",
      "/app/staff/vendors",
      "/app/staff/office-staff",
      "/app/staff/roles",
    ]);
  });

  it("leaves out Office Staff and Role Management without their Read", () => {
    expect(staffSections(false).map((section) => section.label)).toEqual([
      "Employees",
      "Vendor",
    ]);
  });

  it("finds the section a page belongs to", () => {
    expect(activeStaffSection("/app/staff/employees")?.label).toBe("Employees");
    expect(activeStaffSection("/app/staff/employees/new")?.label).toBe(
      "Employees",
    );
    expect(activeStaffSection(employeePagePath("e1"))?.label).toBe("Employees");
    expect(activeStaffSection("/app/staff/vendors/v1")?.label).toBe("Vendor");
    // The old pages are gone, with no redirects (ADR CM-0055 §5).
    expect(activeStaffSection("/app/staff/labours")).toBeUndefined();
    expect(activeStaffSection("/app/staff/site-engineers")).toBeUndefined();
    expect(activeStaffSection("/app/staff/office-staff")?.label).toBe(
      "Office Staff",
    );
    expect(activeStaffSection("/app/staff/office-staff/new")?.label).toBe(
      "Office Staff",
    );
    expect(activeStaffSection(staffPath("u1"))?.label).toBe("Office Staff");
    expect(activeStaffSection(rolePath("r1"))?.label).toBe("Role Management");
    expect(activeStaffSection("/app/staff")).toBeUndefined();
    expect(activeStaffSection("/app/staff/employeesx")).toBeUndefined();
    // Labour Categories are under Masters (ADR CM-0035).
    expect(
      activeStaffSection("/app/masters/labour-categories"),
    ).toBeUndefined();
    expect(activeStaffSection("/app/masters")).toBeUndefined();
  });
});

describe("roleMembersLabel", () => {
  it("counts Staff and Employees on a Role (ADR CM-0055 §2)", () => {
    expect(roleMembersLabel({ userCount: 0, employeeCount: 0 })).toBe(
      "0 Staff",
    );
    expect(roleMembersLabel({ userCount: 1, employeeCount: 0 })).toBe(
      "1 Staff member",
    );
    expect(roleMembersLabel({ userCount: 0, employeeCount: 1 })).toBe(
      "1 Employee",
    );
    expect(roleMembersLabel({ userCount: 2, employeeCount: 12 }, " and ")).toBe(
      "2 Staff and 12 Employees",
    );
  });
});
