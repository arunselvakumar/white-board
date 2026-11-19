import { describe, expect, it } from "vitest";

import { visibleDepartments } from "@/lib/departments-nav";
import {
  FULL_MARKETING_ACCESS,
  NO_MARKETING_ACCESS,
} from "@/lib/marketing-nav";

import { filterDepartments } from "./departments-menu";
import { menuQuery } from "./menu-filter";

const ALL = visibleDepartments({
  canOpenStaffRoles: true,
  marketing: FULL_MARKETING_ACCESS,
});

function shown(query: string, departments = ALL) {
  const match = filterDepartments(departments, menuQuery(query));
  return match?.groups.map((group) => ({
    label: group.label,
    rows: group.sections.map((section) => section.label),
  }));
}

describe("the Departments search (ADR CM-0046)", () => {
  it("lists the departments, not their screens, with no query", () => {
    const match = filterDepartments(ALL, "");
    expect(match?.forceOpen).toBe(false);
    expect(shown("")).toEqual([
      { label: undefined, rows: ["Human Resources", "Marketing"] },
    ]);
  });

  it("shows the departments when Departments itself matches", () => {
    expect(filterDepartments(ALL, "depart")?.forceOpen).toBe(true);
    expect(shown("Depart")).toEqual([
      { label: undefined, rows: ["Human Resources", "Marketing"] },
    ]);
  });

  it("shows a department whose name matches as its row", () => {
    expect(shown("market")).toEqual([
      { label: undefined, rows: ["Marketing"] },
    ]);
  });

  it("finds a screen under its department's name", () => {
    expect(shown("lab")).toEqual([
      { label: "Human Resources", rows: ["Labour"] },
    ]);
    expect(shown("dashboard")).toEqual([
      { label: "Human Resources", rows: ["Dashboard"] },
      { label: "Marketing", rows: ["Dashboard"] },
    ]);
  });

  it("finds a whole group by its heading", () => {
    expect(shown("hrms")).toEqual([
      {
        label: "Human Resources",
        rows: ["Dashboard", "Attendance", "Leave", "Salary", "Configuration"],
      },
    ]);
  });

  it("leaves Departments out when nothing matches, or the Role hides the match", () => {
    expect(shown("zzz")).toBeUndefined();
    const noRoles = visibleDepartments({
      canOpenStaffRoles: false,
      marketing: NO_MARKETING_ACCESS,
    });
    expect(shown("role management", noRoles)).toBeUndefined();
    expect(shown("visits", noRoles)).toBeUndefined();
  });
});
