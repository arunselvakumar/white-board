import { describe, expect, it } from "vitest";

import {
  activeStaffSection,
  rolePath,
  staffPath,
  staffSections,
} from "./staff-nav";

describe("staffSections", () => {
  it("has Labour, Site Engineer, Vendor, Office Staff, then Role Management, all under /app/staff", () => {
    expect(staffSections(true).map((section) => section.label)).toEqual([
      "Labour",
      "Site Engineer",
      "Vendor",
      "Office Staff",
      "Role Management",
    ]);
    expect(staffSections(true).map((section) => section.href)).toEqual([
      "/app/staff/labours",
      "/app/staff/site-engineers",
      "/app/staff/vendors",
      "/app/staff/office-staff",
      "/app/staff/roles",
    ]);
  });

  it("leaves out Office Staff and Role Management without their Read", () => {
    expect(staffSections(false).map((section) => section.label)).toEqual([
      "Labour",
      "Site Engineer",
      "Vendor",
    ]);
  });

  it("finds the section a page belongs to", () => {
    expect(activeStaffSection("/app/staff/labours")?.label).toBe("Labour");
    expect(activeStaffSection("/app/staff/labours/new")?.label).toBe("Labour");
    expect(activeStaffSection("/app/staff/vendors/v1")?.label).toBe("Vendor");
    expect(activeStaffSection("/app/staff/site-engineers")?.label).toBe(
      "Site Engineer",
    );
    expect(activeStaffSection("/app/staff/office-staff")?.label).toBe(
      "Office Staff",
    );
    expect(activeStaffSection("/app/staff/office-staff/new")?.label).toBe(
      "Office Staff",
    );
    expect(activeStaffSection(staffPath("u1"))?.label).toBe("Office Staff");
    expect(activeStaffSection(rolePath("r1"))?.label).toBe("Role Management");
    expect(activeStaffSection("/app/staff")).toBeUndefined();
    expect(activeStaffSection("/app/staff/laboursx")).toBeUndefined();
    // Labour Categories are under Masters (ADR CM-0035).
    expect(
      activeStaffSection("/app/masters/labour-categories"),
    ).toBeUndefined();
    expect(activeStaffSection("/app/masters")).toBeUndefined();
  });
});
