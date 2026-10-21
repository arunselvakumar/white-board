import { readFileSync } from "node:fs";
import { join } from "node:path";

import { Prisma, prisma } from "@repo/construction-db";
import { describe, expect, it } from "vitest";

import { menuByKey } from "@/src/shared-kernel/access";
import { addMember, newCompany } from "@/test/companies";

const M11_MIGRATION = join(
  __dirname,
  "../../../../../packages/db/construction/prisma/migrations/20261021090500_construction_organization_m11_menus/migration.sql",
);

const M11_MENUS = [
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

type Template = Record<string, number>;

/**
 * Runs the migration for one Company only, so files running beside this one
 * keep their Designations as they set them.
 */
async function runMigration(workspaceId: string): Promise<number> {
  const sql = readFileSync(M11_MIGRATION, "utf8").replace(
    'WHERE d."is_seed"',
    `WHERE d."workspace_id" = '${workspaceId}' AND d."is_seed"`,
  );
  expect(sql).toContain(workspaceId);
  return prisma.$executeRawUnsafe(sql);
}

async function templates(workspaceId: string): Promise<Map<string, Template>> {
  const rows = await prisma.constructionOrganizationDesignation.findMany({
    where: { workspaceId, deletedAt: null },
    select: { name: true, permissionTemplate: true },
  });
  return new Map(
    rows.map((row) => [row.name, (row.permissionTemplate ?? {}) as Template]),
  );
}

async function setTemplate(
  workspaceId: string,
  name: string,
  template: Template | null,
): Promise<void> {
  await prisma.constructionOrganizationDesignation.updateMany({
    where: { workspaceId, name },
    data: { permissionTemplate: template ?? Prisma.DbNull },
  });
}

/** A template as a Company made before M11 holds it: no M11 menus. */
function withoutM11(template: Template): Template {
  return Object.fromEntries(
    Object.entries(template).filter(([menu]) => !M11_MENUS.includes(menu)),
  );
}

describe("migration 20261021090500: M11 menus on seeded Designations (CM-1101)", () => {
  it("adds the new cells to existing Companies' templates, keeps theirs, and is idempotent", async () => {
    const { workspaceId, ownerId } = await newCompany();
    const seeded = await templates(workspaceId);
    const accountant = seeded.get("Accountant") ?? {};
    const admin = seeded.get("Admin") ?? {};
    // As before M11, plus a cell the Owner added to an M11 menu by hand and
    // a pre-M11 cell they removed.
    await setTemplate(workspaceId, "Accountant", {
      ...withoutM11(accountant),
      "finance.tds": 1,
      "finance.petty_cash": 2,
    });
    await setTemplate(workspaceId, "Admin", withoutM11(admin));
    await setTemplate(
      workspaceId,
      "Site Engineer",
      withoutM11(seeded.get("Site Engineer") ?? {}),
    );
    // A renamed seed and a member's own grants are left alone.
    const member = await addMember(workspaceId, ownerId, {
      "finance.payments": ["read"],
    });
    await prisma.constructionOrganizationDesignation.updateMany({
      where: { workspaceId, name: "Site Engineer" },
      data: { name: "Site Engineer (Civil)" },
    });

    expect(await runMigration(workspaceId)).toBe(2);
    const after = await templates(workspaceId);
    expect(after.get("Accountant")).toEqual({
      ...accountant,
      "finance.petty_cash": 2,
    });
    expect(after.get("Admin")).toEqual(admin);
    for (const menu of M11_MENUS)
      expect(after.get("Admin")?.[menu]).toBe(menuByKey(menu)?.supported);
    expect(
      Object.keys(after.get("Site Engineer (Civil)") ?? {}).filter((menu) =>
        M11_MENUS.includes(menu),
      ),
    ).toEqual([]);
    const grants =
      await prisma.constructionOrganizationMemberMenuPermission.findMany({
        where: { memberId: member.memberId },
        select: { menu: true },
      });
    expect(grants.map((row) => row.menu)).toEqual(["finance.payments"]);

    expect(await runMigration(workspaceId)).toBe(0);
    expect(await templates(workspaceId)).toEqual(after);
  });

  it("changes nothing for a Company created with the version 2 seeds", async () => {
    const { workspaceId } = await newCompany();
    const before = await templates(workspaceId);
    expect(await runMigration(workspaceId)).toBe(0);
    expect(await templates(workspaceId)).toEqual(before);
  });

  it("skips a seeded Designation whose template was cleared", async () => {
    const { workspaceId } = await newCompany();
    await setTemplate(workspaceId, "Quality Control", null);
    expect(await runMigration(workspaceId)).toBe(0);
  });
});
