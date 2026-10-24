import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { menuByKey, type MenuKey } from "@/src/shared-kernel/access";
import { maskFromLetters } from "@/src/shared-kernel/access/flags";

import { seedRoles } from "./role-seeds";

const BACKFILL_MIGRATION = join(
  __dirname,
  "../../../../../packages/db/construction/prisma/migrations/20261021120000_construction_organization_menu_backfill/migration.sql",
);

/** Matrix cells M5–M8 added, and when each milestone was merged to main. */
const NEW_CELLS: readonly { menu: MenuKey; letters: string; since: string }[] =
  [
    {
      menu: "masters.terms_conditions",
      letters: "CRUD",
      since: "2026-10-10 20:55:04+05:30",
    },
    {
      menu: "site_work.daily_worksheet",
      letters: "J",
      since: "2026-10-11 13:50:25+05:30",
    },
    {
      menu: "site_work.equipment_usage",
      letters: "J",
      since: "2026-10-11 13:50:25+05:30",
    },
    {
      menu: "site_work.site_diary",
      letters: "CRUDP",
      since: "2026-10-11 13:50:25+05:30",
    },
    {
      menu: "site_work.hindrances",
      letters: "CRUDPO",
      since: "2026-10-11 13:50:25+05:30",
    },
    {
      menu: "finance.other_expenses",
      letters: "CRUDAJPO",
      since: "2026-10-12 10:46:29+05:30",
    },
    {
      menu: "masters.tags",
      letters: "CRUD",
      since: "2026-10-15 09:12:07+05:30",
    },
  ];

/** `designation → menu → [mask, since]` from the migration's VALUES list. */
function migrationGrants(
  sql: string,
): Record<string, Record<string, [number, string]>> {
  const grants: Record<string, Record<string, [number, string]>> = {};
  for (const [
    ,
    designation = "",
    menu = "",
    flags = "",
    since = "",
  ] of sql.matchAll(/\('([^']+)', '([^']+)', (\d+), '([^']+)'/g))
    (grants[designation] ??= {})[menu] = [Number(flags), since];
  return grants;
}

describe("M5–M8 menu backfill migration", () => {
  // The templates this migration topped up moved to the seed Roles of the
  // same names (ADR CM-0030); HRMS Staff never held these menus.
  it("granted existing Companies' seeded Designations the same new cells as new ones", () => {
    const seeded = seedRoles({
      workspaceId: "company-1",
      by: "user-1",
      now: new Date("2026-10-21T00:00:00Z"),
    });
    const fromSeeds: Record<string, Record<string, [number, string]>> = {};
    for (const role of seeded)
      for (const { menu, letters, since } of NEW_CELLS) {
        const mask = role.permissions.mask(menu) & maskFromLetters(letters);
        if (mask !== 0) (fromSeeds[role.name] ??= {})[menu] = [mask, since];
      }
    expect(migrationGrants(readFileSync(BACKFILL_MIGRATION, "utf8"))).toEqual(
      fromSeeds,
    );
  });

  it("lists only cells the menus support", () => {
    for (const { menu, letters } of NEW_CELLS) {
      const bits = maskFromLetters(letters);
      expect((menuByKey(menu)?.supported ?? 0) & bits, menu).toBe(bits);
    }
  });
});
