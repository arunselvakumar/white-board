import { describe, expect, it } from "vitest";

import {
  MENUS,
  PermissionSet,
  hrmsDefaultPermissions,
  isMenuKey,
} from "@/src/shared-kernel/access";

import { seedRoleGrants, seedRoles } from "./role-seeds";

describe("role seed set (ADR CM-0030 §5)", () => {
  const seeded = seedRoles({
    workspaceId: "company-1",
    by: "user-1",
    now: new Date("2026-10-24T00:00:00Z"),
  });

  it("holds the nine default Roles", () => {
    expect(seeded.map((role) => role.name)).toEqual([
      "Admin",
      "Project Manager",
      "Site Engineer",
      "Site Supervisor",
      "Store Keeper",
      "Accountant",
      "Quality Control",
      "Structural Engineer",
      "HRMS Staff",
    ]);
    expect(seeded.every((role) => role.isSeed)).toBe(true);
  });

  it("names only catalogue menus and grants only cells they support", () => {
    for (const { name, grants } of seedRoleGrants()) {
      for (const menu of Object.keys(grants))
        expect(isMenuKey(menu), `${name}: ${menu}`).toBe(true);
      const sanitized = PermissionSet.fromGrants(grants).toGrants();
      expect(sanitized, name).toEqual(grants);
    }
  });

  it("gives Admin every supported cell, Role Management included", () => {
    const admin = seeded.find((role) => role.name === "Admin");
    for (const menu of MENUS)
      expect(admin?.permissions.mask(menu.key), menu.key).toBe(menu.supported);
    expect(admin?.permissions.has("organization.roles", "update")).toBe(true);
  });

  it("gives HRMS Staff the HRMS default set", () => {
    const hrms = seeded.find((role) => role.name === "HRMS Staff");
    expect(hrms?.permissions.equals(hrmsDefaultPermissions())).toBe(true);
  });
});
