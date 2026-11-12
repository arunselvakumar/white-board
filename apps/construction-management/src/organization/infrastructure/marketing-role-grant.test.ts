import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { MENUS, toMask } from "@/src/shared-kernel/access";

import { MARKETING_ROLE, seedRoles } from "./role-seeds";

const MIGRATION = join(
  __dirname,
  "../../../../../packages/db/construction/prisma/migrations/20261112090000_construction_organization_marketing_role/migration.sql",
);

/** The `(menu, flags)` rows of the VALUES list after a `-- <label>` line. */
function cells(sql: string, label: string): Record<string, number> {
  const start = sql.indexOf(`-- ${label}\n`);
  if (start < 0) throw new Error(`No "${label}" block`);
  const block = /\(VALUES([\s\S]*?)\) AS cell/.exec(sql.slice(start))?.[1];
  if (block == null) throw new Error(`No VALUES in "${label}"`);
  const found: Record<string, number> = {};
  for (const [, menu = "", flags = ""] of block.matchAll(
    /\('([a-z_.]+)', (\d+)\)/g,
  ))
    found[menu] = Number(flags);
  return found;
}

const seeds = seedRoles({
  workspaceId: "company-1",
  by: "user-1",
  now: new Date("2026-11-12T00:00:00Z"),
});

const MARKETING_MENUS = MENUS.filter((menu) => menu.category === "marketing");

describe("Marketing Role migration (ADR CM-0040 §3)", () => {
  const sql = readFileSync(MIGRATION, "utf8");

  it("gives existing Companies the seeded Marketing Role's cells", () => {
    const role = seeds.find((seed) => seed.name === MARKETING_ROLE);
    if (role == null) throw new Error("No Marketing seed Role");
    const expected = Object.fromEntries(
      Object.entries(role.permissions.toGrants()).map(([menu, flags]) => [
        menu,
        toMask(flags),
      ]),
    );
    expect(cells(sql, "Marketing Role cells")).toEqual(expected);
    expect(sql).toContain(`'${role.description ?? ""}'`);
  });

  it("gives the seeded Admin every supported Marketing cell, as ALL does", () => {
    const admin = seeds.find((seed) => seed.name === "Admin");
    if (admin == null) throw new Error("No Admin seed Role");
    const grants = admin.permissions.toGrants();
    const expected = Object.fromEntries(
      MARKETING_MENUS.map((menu) => [menu.key, menu.supported]),
    );
    expect(cells(sql, "Admin cells")).toEqual(expected);
    for (const menu of MARKETING_MENUS)
      expect(toMask(grants[menu.key] ?? [])).toBe(menu.supported);
  });

  it("grants Marketing to no other seeded Role", () => {
    const holders = seeds
      .filter((seed) =>
        Object.keys(seed.permissions.toGrants()).some((menu) =>
          menu.startsWith("marketing."),
        ),
      )
      .map((seed) => seed.name);
    expect(holders).toEqual(["Admin", MARKETING_ROLE]);
  });
});
