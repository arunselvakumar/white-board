import { describe, expect, it } from "vitest";

import {
  HUMAN_RESOURCES,
  MARKETING_DEPARTMENT,
  activeDepartment,
  humanResourcesGroups,
  marketingGroups,
  visibleDepartments,
} from "./departments-nav";
import { HRMS_SECTIONS } from "./hrms-nav";
import { FULL_MARKETING_ACCESS, NO_MARKETING_ACCESS } from "./marketing-nav";

describe("Departments (ADR CM-0046)", () => {
  it("puts Staff, then HRMS with one card per HRMS area, on Human Resources", () => {
    const groups = humanResourcesGroups(true);
    expect(groups.map((group) => group.label)).toEqual(["Staff", "HRMS"]);
    expect(groups[0]?.sections.map((card) => card.label)).toEqual([
      "Labour",
      "Site Engineer",
      "Vendor",
      "Office Staff",
      "Role Management",
    ]);
    expect(groups[1]?.sections.map((card) => card.href)).toEqual(
      HRMS_SECTIONS.map((section) => section.href),
    );
    for (const card of groups.flatMap((group) => group.sections))
      expect(card.description).not.toBe("");
  });

  it("leaves Office Staff and Role Management off without Team Members or Role Management Read", () => {
    const labels = humanResourcesGroups(false)[0]?.sections.map(
      (card) => card.label,
    );
    expect(labels).toEqual(["Labour", "Site Engineer", "Vendor"]);
  });

  it("shows Marketing's cards the Role opens, and no group without one", () => {
    expect(
      marketingGroups({
        ...NO_MARKETING_ACCESS,
        visits: true,
        companies: true,
      })[0]?.sections.map((card) => card.label),
    ).toEqual(["Visits", "Companies"]);
    expect(marketingGroups(NO_MARKETING_ACCESS)).toEqual([]);
  });

  it("lists Human Resources for everyone and Marketing only with one of its entries", () => {
    const names = (marketing: typeof NO_MARKETING_ACCESS) =>
      visibleDepartments({ canOpenStaffRoles: true, marketing }).map(
        ({ department }) => department.label,
      );
    expect(names(FULL_MARKETING_ACCESS)).toEqual([
      "Human Resources",
      "Marketing",
    ]);
    expect(names(NO_MARKETING_ACCESS)).toEqual(["Human Resources"]);
  });

  it("finds the department of its page and of every screen in it", () => {
    for (const path of [
      HUMAN_RESOURCES.href,
      "/app/staff",
      "/app/staff/labours",
      "/app/staff/roles/r1",
      "/app/hrms",
      "/app/hrms/attendance/team",
    ])
      expect(activeDepartment(path)).toBe(HUMAN_RESOURCES);
    for (const path of [
      MARKETING_DEPARTMENT.href,
      "/app/marketing",
      "/app/marketing/visits/v1",
    ])
      expect(activeDepartment(path)).toBe(MARKETING_DEPARTMENT);
    for (const path of [
      "/app/departments",
      "/app/staffing",
      "/app/marketingx",
      "/app/masters/departments",
      "/app/projects",
    ])
      expect(activeDepartment(path)).toBeUndefined();
  });
});
