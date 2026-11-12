import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { prisma } from "@repo/construction-db";
import { describe, expect, it } from "vitest";

import { MENUS, fromMask, toMask } from "@/src/shared-kernel/access";

import { createCompanyHandlers } from "./create-company-handlers";
import { MARKETING_ROLE, seedRoles } from "./role-seeds";

const MIGRATION = join(
  __dirname,
  "../../../../../packages/db/construction/prisma/migrations/20261112090000_construction_organization_marketing_role/migration.sql",
);

const MARKETING_MENUS = MENUS.filter((menu) => menu.category === "marketing");

async function newCompany(name: string): Promise<string> {
  const userId = randomUUID();
  await prisma.identityUser.create({
    data: {
      id: userId,
      name: "Arun Selva Kumar",
      email: `${userId}@example.test`,
      emailVerified: true,
    },
  });
  const { workspaceId } = await createCompanyHandlers().create.execute({
    name,
    country: "IN",
    userId,
    userName: "Arun Selva Kumar",
    userMobile: null,
    userEmail: `${userId}@example.test`,
  });
  return workspaceId;
}

/** A Company as it stood before Marketing: no Marketing Role, no cells. */
async function asBeforeMarketing(workspaceId: string): Promise<void> {
  await prisma.constructionOrganizationRoleMenuPermission.deleteMany({
    where: { workspaceId, menu: { startsWith: "marketing." } },
  });
  await prisma.constructionOrganizationRole.deleteMany({
    where: { workspaceId, name: MARKETING_ROLE },
  });
}

/**
 * The migration's statements, limited to these Companies so that other
 * tests' Companies are not touched while it runs.
 */
function statementsFor(workspaceIds: readonly string[]): string[] {
  const list = workspaceIds.map((id) => `'${id}'`).join(", ");
  const companies = `FROM "construction_organization"."team_members") c`;
  const admin = `AND r."name" = 'Admin'`;
  const sql = readFileSync(MIGRATION, "utf8");
  if (!sql.includes(companies) || !sql.includes(admin))
    throw new Error("The migration changed shape; update this test");
  return sql
    .replace(
      companies,
      `FROM "construction_organization"."team_members" WHERE "workspace_id" IN (${list})) c`,
    )
    .replace(admin, `${admin} AND r."workspace_id" IN (${list})`)
    .replace(/"migration_marketing_role"/g, `"migration_marketing_role_test"`)
    .split(/;\s*\n/)
    .map((statement) =>
      statement
        .split("\n")
        .filter((line) => !line.trim().startsWith("--"))
        .join("\n")
        .trim(),
    )
    .filter((statement) => statement !== "");
}

async function runMigration(workspaceIds: readonly string[]): Promise<void> {
  await prisma.$transaction(async (tx) => {
    for (const statement of statementsFor(workspaceIds))
      await tx.$executeRawUnsafe(statement);
  });
}

async function grantsOf(
  workspaceId: string,
  name: string,
): Promise<Record<string, number>> {
  const role = await prisma.constructionOrganizationRole.findFirstOrThrow({
    where: { workspaceId, name, deletedAt: null },
    include: { permissions: true },
  });
  return Object.fromEntries(
    role.permissions
      .filter((cell) => cell.menu.startsWith("marketing."))
      .map((cell) => [cell.menu, cell.flags]),
  );
}

describe("Marketing Role migration on Postgres (ADR CM-0040 §3)", () => {
  it("seeds the Marketing Role and Admin's Marketing cells in an existing Company, and audits the Role", async () => {
    const workspaceId = await newCompany("Anugraha Engineers");
    await asBeforeMarketing(workspaceId);

    await runMigration([workspaceId]);

    const seed = seedRoles({ workspaceId, by: "system", now: new Date() }).find(
      (role) => role.name === MARKETING_ROLE,
    );
    if (seed == null) throw new Error("No Marketing seed Role");
    const expected = Object.fromEntries(
      Object.entries(seed.permissions.toGrants()).map(([menu, flags]) => [
        menu,
        toMask(flags),
      ]),
    );
    await expect(grantsOf(workspaceId, MARKETING_ROLE)).resolves.toEqual(
      expected,
    );
    const role = await prisma.constructionOrganizationRole.findFirstOrThrow({
      where: { workspaceId, name: MARKETING_ROLE },
    });
    expect(role.isSeed).toBe(true);
    expect(role.description).toBe(seed.description);
    const audit =
      await prisma.constructionOrganizationAuditEvent.findFirstOrThrow({
        where: { workspaceId, action: "role.created", entityId: role.id },
      });
    expect(audit.actorUserId).toBe("system");
    expect(audit.after).toEqual({
      name: MARKETING_ROLE,
      description: seed.description,
      permissions: Object.fromEntries(
        Object.entries(expected).map(([menu, mask]) => [menu, fromMask(mask)]),
      ),
    });

    await expect(grantsOf(workspaceId, "Admin")).resolves.toEqual(
      Object.fromEntries(
        MARKETING_MENUS.map((menu) => [menu.key, menu.supported]),
      ),
    );
    const others =
      await prisma.constructionOrganizationRoleMenuPermission.count({
        where: {
          workspaceId,
          menu: { startsWith: "marketing." },
          role: { name: { notIn: ["Admin", MARKETING_ROLE] } },
        },
      });
    expect(others).toBe(0);
  });

  it("leaves a Company's own Marketing Role alone and gives it no default one", async () => {
    const workspaceId = await newCompany("Sri Balaji Builders");
    await asBeforeMarketing(workspaceId);
    const own = await prisma.constructionOrganizationRole.create({
      data: {
        id: randomUUID(),
        workspaceId,
        name: "marketing",
        createdBy: "user-1",
        updatedBy: "user-1",
      },
    });

    await runMigration([workspaceId]);

    const named = await prisma.constructionOrganizationRole.findMany({
      where: {
        workspaceId,
        name: { equals: MARKETING_ROLE, mode: "insensitive" },
      },
    });
    expect(named.map((role) => role.id)).toEqual([own.id]);
    await expect(
      prisma.constructionOrganizationRoleMenuPermission.count({
        where: { roleId: own.id },
      }),
    ).resolves.toBe(0);
    // Admin still gets its cells.
    await expect(grantsOf(workspaceId, "Admin")).resolves.toEqual(
      Object.fromEntries(
        MARKETING_MENUS.map((menu) => [menu.key, menu.supported]),
      ),
    );
  });

  it("keeps an Admin cell the Company had and only adds to it", async () => {
    const workspaceId = await newCompany("Kaveri Steel");
    await asBeforeMarketing(workspaceId);
    const admin = await prisma.constructionOrganizationRole.findFirstOrThrow({
      where: { workspaceId, name: "Admin" },
    });
    await prisma.constructionOrganizationRoleMenuPermission.create({
      data: {
        workspaceId,
        roleId: admin.id,
        menu: "marketing.team",
        flags: toMask(["read"]),
        updatedBy: "user-1",
      },
    });

    await runMigration([workspaceId]);
    await runMigration([workspaceId]);

    await expect(grantsOf(workspaceId, "Admin")).resolves.toMatchObject({
      "marketing.team": toMask(["read", "update"]),
    });
    await expect(
      prisma.constructionOrganizationRole.count({
        where: { workspaceId, name: MARKETING_ROLE },
      }),
    ).resolves.toBe(1);
  });
});
