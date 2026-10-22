import { readFileSync } from "node:fs";
import { join } from "node:path";

import { Prisma, prisma } from "@repo/construction-db";
import { describe, expect, it } from "vitest";

import { maskFromLetters } from "@/src/shared-kernel/access/flags";
import { addMember, newCompany } from "@/test/companies";

const BACKFILL_MIGRATION = join(
  __dirname,
  "../../../../../packages/db/construction/prisma/migrations/20261021120000_construction_organization_menu_backfill/migration.sql",
);

/** The matrix cells each milestone added, as the migration dates them. */
const BEFORE_M5 = new Date("2026-10-10T00:00:00+05:30");
const BETWEEN_M6_AND_M7 = new Date("2026-10-12T00:00:00+05:30");
const M5_TO_M8: Template = {
  "masters.terms_conditions": maskFromLetters("CRUD"),
  "site_work.daily_worksheet": maskFromLetters("J"),
  "site_work.equipment_usage": maskFromLetters("J"),
  "site_work.site_diary": maskFromLetters("CRUDP"),
  "site_work.hindrances": maskFromLetters("CRUDPO"),
  "finance.other_expenses": maskFromLetters("CRUDAJPO"),
  "masters.tags": maskFromLetters("CRUD"),
};
const M7_TO_M8: Template = {
  "finance.other_expenses": maskFromLetters("CRUDAJPO"),
  "masters.tags": maskFromLetters("CRUD"),
};
const SITE_DIARY: Template = {
  "site_work.site_diary": maskFromLetters("CRUDP"),
};

type Template = Record<string, number>;

/**
 * Runs the migration for one Company only, so files running beside this one
 * keep their Designations as they set them.
 */
async function runMigration(workspaceId: string): Promise<number> {
  const sql = readFileSync(BACKFILL_MIGRATION, "utf8").replace(
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

/** Dates the Company's Designations as if it had been created then. */
async function createdAt(workspaceId: string, at: Date): Promise<void> {
  await prisma.constructionOrganizationDesignation.updateMany({
    where: { workspaceId },
    data: { createdAt: at, updatedAt: at },
  });
}

/** A template without these cells, as a Company made before them holds it. */
function without(template: Template, cells: Template): Template {
  const result: Template = {};
  for (const [menu, mask] of Object.entries(template)) {
    const kept = mask & ~(cells[menu] ?? 0);
    if (kept !== 0) result[menu] = kept;
  }
  return result;
}

/** Strips `cells` from every seeded template, as the old seeds had them. */
async function asOldCompany(
  workspaceId: string,
  seeded: Map<string, Template>,
  cells: Template,
  at: Date,
): Promise<void> {
  for (const [name, template] of seeded)
    if (Object.keys(template).length > 0)
      await setTemplate(workspaceId, name, without(template, cells));
  await createdAt(workspaceId, at);
}

describe("migration 20261021120000: M5–M8 menus on seeded Designations", () => {
  it("adds the cells a new Company gets, keeps the Owner's edits, and is idempotent", async () => {
    const { workspaceId, ownerId } = await newCompany();
    const seeded = await templates(workspaceId);
    await asOldCompany(workspaceId, seeded, M5_TO_M8, BEFORE_M5);
    // The Owner removed a pre-M5 cell from the Accountant and gave them Tags
    // read by hand, which the seed gives no Accountant.
    const accountant = seeded.get("Accountant") ?? {};
    await setTemplate(workspaceId, "Accountant", {
      ...without(accountant, { ...M5_TO_M8, "finance.petty_cash": 1 }),
      "masters.tags": maskFromLetters("R"),
    });
    // A renamed seed and a member's own grants are left alone.
    const member = await addMember(workspaceId, ownerId, {
      "finance.payments": ["read"],
    });
    await prisma.constructionOrganizationDesignation.updateMany({
      where: { workspaceId, name: "Site Engineer" },
      data: { name: "Site Engineer (Civil)" },
    });

    // Admin, Accountant, Project Manager, Site Supervisor.
    expect(await runMigration(workspaceId)).toBe(4);
    const after = await templates(workspaceId);
    for (const name of ["Admin", "Project Manager", "Site Supervisor"])
      expect(after.get(name), name).toEqual(seeded.get(name));
    expect(after.get("Accountant")).toEqual({
      ...without(accountant, { "finance.petty_cash": 1 }),
      "masters.tags": maskFromLetters("R"),
    });
    expect(after.get("Site Engineer (Civil)")).toEqual(
      without(seeded.get("Site Engineer") ?? {}, M5_TO_M8),
    );
    const grants =
      await prisma.constructionOrganizationMemberMenuPermission.findMany({
        where: { memberId: member.memberId },
        select: { menu: true },
      });
    expect(grants.map((row) => row.menu)).toEqual(["finance.payments"]);

    expect(await runMigration(workspaceId)).toBe(0);
    expect(await templates(workspaceId)).toEqual(after);
  });

  it("does not give back a cell the Owner removed after its milestone", async () => {
    const { workspaceId } = await newCompany();
    const seeded = await templates(workspaceId);
    await asOldCompany(workspaceId, seeded, M7_TO_M8, BETWEEN_M6_AND_M7);
    // An M6 menu the Owner took off the Project Manager.
    const manager = seeded.get("Project Manager") ?? {};
    await setTemplate(
      workspaceId,
      "Project Manager",
      without(manager, { ...M7_TO_M8, ...SITE_DIARY }),
    );

    await runMigration(workspaceId);
    const after = await templates(workspaceId);
    expect(after.get("Project Manager")).toEqual(without(manager, SITE_DIARY));
    expect(after.get("Admin")).toEqual(seeded.get("Admin"));
  });

  it("changes nothing for a Company created with today's seeds", async () => {
    const { workspaceId } = await newCompany();
    const before = await templates(workspaceId);
    expect(await runMigration(workspaceId)).toBe(0);
    expect(await templates(workspaceId)).toEqual(before);
  });

  it("skips a seeded Designation whose template was cleared", async () => {
    const { workspaceId } = await newCompany();
    await createdAt(workspaceId, BEFORE_M5);
    for (const name of [
      "Admin",
      "Accountant",
      "Project Manager",
      "Site Engineer",
      "Site Supervisor",
    ])
      await setTemplate(workspaceId, name, null);
    expect(await runMigration(workspaceId)).toBe(0);
  });
});
