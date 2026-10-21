import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { MENUS, PermissionSet, type MenuKey } from "@/src/shared-kernel/access";

import {
  DESIGNATION_SEED_VERSION,
  seedDesignations,
  seedTemplates,
} from "./designation-seeds";

const M11_MIGRATION = join(
  __dirname,
  "../../../../../packages/db/construction/prisma/migrations/20261021090500_construction_organization_m11_menus/migration.sql",
);

/** The menus M11 added (ADR CM-0023 §22); the migration grants only these. */
const M11_MENUS: readonly MenuKey[] = [
  "contracts.boq",
  "contracts.work_orders",
  "contracts.measurements",
  "contracts.contractor_bills",
  "contracts.client_bills",
  "contracts.items",
  "masters.clients",
  "finance.gst",
  "finance.tds",
  "labour.compliance",
  "sales.collections",
  "sales.rera",
  "site_work.concrete",
];

/** `designation → menu → mask` from the migration's VALUES list. */
function migrationGrants(sql: string): Record<string, Record<string, number>> {
  const grants: Record<string, Record<string, number>> = {};
  for (const [, designation = "", menu = "", flags = ""] of sql.matchAll(
    /\('([^']+)', '([^']+)', (\d+)\)/g,
  ))
    (grants[designation] ??= {})[menu] = Number(flags);
  return grants;
}

describe("designation seed set (CM-106)", () => {
  const seeded = seedDesignations({
    workspaceId: "company-1",
    by: "user-1",
    now: new Date("2026-10-08T00:00:00Z"),
  });

  it("holds the 38 default names, eight with templates", () => {
    expect(seeded).toHaveLength(38);
    expect(new Set(seeded.map((item) => item.name)).size).toBe(38);
    expect(
      seeded.filter((item) => item.template != null).map((item) => item.name),
    ).toEqual([
      "Accountant",
      "Admin",
      "Project Manager",
      // Inspection approve / reject and issue verify (ADR CM-0019).
      "Quality Control",
      "Site Engineer",
      "Site Supervisor",
      "Store Keeper",
      "Structural Engineer",
    ]);
    expect(seeded.every((item) => item.isSeed)).toBe(true);
  });

  it("grants only cells the menus support", () => {
    for (const { name, grants } of seedTemplates()) {
      const sanitized = PermissionSet.fromGrants(grants).toGrants();
      expect(sanitized, name).toEqual(grants);
    }
  });

  it("is version 2 since M11 added the Contracts & Billing menus", () => {
    expect(DESIGNATION_SEED_VERSION).toBe(2);
  });

  it("grants existing Companies' seeded Designations the same M11 cells as new ones (CM-1101)", () => {
    const fromSeeds: Record<string, Record<string, number>> = {};
    for (const designation of seeded) {
      const template = designation.template;
      if (template == null) continue;
      for (const menu of M11_MENUS) {
        const mask = template.mask(menu);
        if (mask !== 0) (fromSeeds[designation.name] ??= {})[menu] = mask;
      }
    }
    expect(migrationGrants(readFileSync(M11_MIGRATION, "utf8"))).toEqual(
      fromSeeds,
    );
    // Starter cells chosen per role (ADR CM-0023 §22).
    expect(Object.keys(fromSeeds).sort()).toEqual([
      "Accountant",
      "Admin",
      "Project Manager",
      "Quality Control",
      "Site Engineer",
      "Site Supervisor",
      "Structural Engineer",
    ]);
  });

  it("gives Admin every supported cell", () => {
    const admin = seeded.find((item) => item.name === "Admin");
    for (const menu of MENUS)
      expect(admin?.template?.mask(menu.key)).toBe(menu.supported);
  });
});
