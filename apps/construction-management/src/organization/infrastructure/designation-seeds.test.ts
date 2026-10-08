import { describe, expect, it } from "vitest";

import { MENUS, PermissionSet } from "@/src/shared-kernel/access";

import { seedDesignations, seedTemplates } from "./designation-seeds";

describe("designation seed set (CM-106)", () => {
  const seeded = seedDesignations({
    workspaceId: "company-1",
    by: "user-1",
    now: new Date("2026-10-08T00:00:00Z"),
  });

  it("holds the 38 default names, six with templates", () => {
    expect(seeded).toHaveLength(38);
    expect(new Set(seeded.map((item) => item.name)).size).toBe(38);
    expect(
      seeded.filter((item) => item.template != null).map((item) => item.name),
    ).toEqual([
      "Accountant",
      "Admin",
      "Project Manager",
      "Site Engineer",
      "Site Supervisor",
      "Store Keeper",
    ]);
    expect(seeded.every((item) => item.isSeed)).toBe(true);
  });

  it("grants only cells the menus support", () => {
    for (const { name, grants } of seedTemplates()) {
      const sanitized = PermissionSet.fromGrants(grants).toGrants();
      expect(sanitized, name).toEqual(grants);
    }
  });

  it("gives Admin every supported cell", () => {
    const admin = seeded.find((item) => item.name === "Admin");
    for (const menu of MENUS)
      expect(admin?.template?.mask(menu.key)).toBe(menu.supported);
  });
});
