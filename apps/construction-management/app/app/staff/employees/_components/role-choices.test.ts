import { describe, expect, it } from "vitest";

import {
  NO_DEPARTMENT,
  defaultRoleAssignment,
  departmentChoices,
  rolesUnder,
  type RoleOption,
} from "./role-choices";

const HR = { id: "d-hr", name: "Human Resources" };
const SITE = { id: "d-site", name: "Site" };

const roles: RoleOption[] = [
  { id: "r-se", name: "Site Engineer", department: HR },
  { id: "r-labour", name: "Labour", department: HR },
  { id: "r-mason", name: "Mason", department: SITE },
  { id: "r-driver", name: "Driver", department: null },
];

describe("Department and Role choices (ADR CM-0055 §2)", () => {
  it("lists live Departments by name, then No department when a Role has none", () => {
    expect(departmentChoices([SITE, HR], roles)).toEqual([
      { value: "d-hr", label: "Human Resources" },
      { value: "d-site", label: "Site" },
      { value: NO_DEPARTMENT, label: "No department" },
    ]);
    expect(
      departmentChoices(
        [HR],
        roles.filter((role) => role.department != null),
      ).map((choice) => choice.value),
    ).toEqual(["d-hr"]);
  });

  it("offers only the Roles under the chosen Department, by name", () => {
    expect(rolesUnder(roles, "d-hr").map((role) => role.name)).toEqual([
      "Labour",
      "Site Engineer",
    ]);
    expect(rolesUnder(roles, NO_DEPARTMENT).map((role) => role.id)).toEqual([
      "r-driver",
    ]);
    expect(rolesUnder(roles, "")).toEqual([]);
  });

  it("starts Add Employee on Human Resources → Labour, or blank without it", () => {
    expect(defaultRoleAssignment(roles)).toEqual({
      departmentId: "d-hr",
      roleId: "r-labour",
    });
    expect(
      defaultRoleAssignment([
        { id: "r-labour", name: "Labour", department: SITE },
      ]),
    ).toEqual({ departmentId: "", roleId: "" });
  });
});
