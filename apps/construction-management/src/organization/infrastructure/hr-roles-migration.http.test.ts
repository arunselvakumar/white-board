import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { prisma } from "@repo/construction-db";
import { describe, expect, it } from "vitest";

import { createCompanyHandlers } from "./create-company-handlers";
import { LABOUR_ROLE, SITE_ENGINEER_ROLE, VENDOR_ROLE } from "./role-seeds";

const MIGRATION = join(
  __dirname,
  "../../../../../packages/db/construction/prisma/migrations/20261126120000_construction_organization_hr_roles/migration.sql",
);

const SITE_SUPERVISOR = "Site Supervisor";

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

async function liveRole(workspaceId: string, name: string) {
  return prisma.constructionOrganizationRole.findFirst({
    where: { workspaceId, name, deletedAt: null },
    include: { department: true, permissions: true },
  });
}

/**
 * A Company as it stood before ADR CM-0054: no Labour or Vendor Role, Site
 * Engineer under no Department, and a default Site Supervisor Role.
 */
async function asBefore(workspaceId: string): Promise<string> {
  await prisma.constructionOrganizationRole.deleteMany({
    where: { workspaceId, name: { in: [LABOUR_ROLE, VENDOR_ROLE] } },
  });
  await prisma.constructionOrganizationRole.updateMany({
    where: { workspaceId, name: SITE_ENGINEER_ROLE },
    data: { departmentId: null },
  });
  const supervisor = await prisma.constructionOrganizationRole.create({
    data: {
      id: randomUUID(),
      workspaceId,
      name: SITE_SUPERVISOR,
      isSeed: true,
      createdBy: "system",
      updatedBy: "system",
      permissions: {
        create: {
          workspaceId,
          menu: "labour.attendance",
          flags: 7,
          updatedBy: "system",
        },
      },
    },
  });
  return supervisor.id;
}

async function memberOn(workspaceId: string, roleId: string, name: string) {
  return prisma.constructionOrganizationTeamMember.create({
    data: {
      id: randomUUID(),
      workspaceId,
      name,
      email: `${randomUUID()}@example.test`,
      roleId,
      status: "active",
      createdBy: "user-1",
      updatedBy: "user-1",
    },
  });
}

/**
 * The migration's statements, limited to these Companies so that other
 * tests' Companies are not touched while it runs.
 */
function statementsFor(workspaceIds: readonly string[]): string[] {
  const list = workspaceIds.map((id) => `'${id}'`).join(", ");
  const companies = `FROM "construction_organization"."team_members") c`;
  const engineer = `AND r."name" = 'Site Engineer'\n   AND r."department_id" IS NULL`;
  const supervisor = `AND s."name" = 'Site Supervisor'`;
  const sql = readFileSync(MIGRATION, "utf8");
  for (const shape of [companies, engineer, supervisor])
    if (!sql.includes(shape))
      throw new Error("The migration changed shape; update this test");
  return sql
    .replace(
      companies,
      `FROM "construction_organization"."team_members" WHERE "workspace_id" IN (${list})) c`,
    )
    .replace(engineer, `${engineer} AND r."workspace_id" IN (${list})`)
    .replace(supervisor, `${supervisor} AND s."workspace_id" IN (${list})`)
    .replace(/"migration_/g, `"migration_test_`)
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

describe("Human Resources Roles migration on Postgres (ADR CM-0054)", () => {
  it("adds Labour and Vendor under Human Resources, puts Site Engineer there, and moves Site Supervisor's staff to Site Engineer", async () => {
    const workspaceId = await newCompany("Anugraha Engineers");
    const supervisorId = await asBefore(workspaceId);
    const member = await memberOn(workspaceId, supervisorId, "Murugan Pillai");
    const gone = await memberOn(workspaceId, supervisorId, "Left Already");
    await prisma.constructionOrganizationTeamMember.update({
      where: { id: gone.id },
      data: { deletedAt: new Date() },
    });

    await runMigration([workspaceId]);

    for (const name of [LABOUR_ROLE, VENDOR_ROLE]) {
      const role = await liveRole(workspaceId, name);
      expect(role, name).toMatchObject({
        isSeed: true,
        createdBy: "system",
        department: { name: "Human Resources", isSystem: true },
      });
      expect(role?.permissions, name).toEqual([]);
      const audit =
        await prisma.constructionOrganizationAuditEvent.findFirstOrThrow({
          where: { workspaceId, action: "role.created", entityId: role?.id },
        });
      expect(audit.after).toEqual({
        name,
        description: role?.description,
        departmentId: role?.departmentId,
        permissions: {},
      });
    }

    const engineer = await liveRole(workspaceId, SITE_ENGINEER_ROLE);
    expect(engineer?.department?.name).toBe("Human Resources");
    await expect(
      prisma.constructionOrganizationAuditEvent.count({
        where: { workspaceId, action: "role.updated", entityId: engineer?.id },
      }),
    ).resolves.toBe(1);

    // Site Supervisor is soft-deleted, its matrix kept for the record.
    await expect(liveRole(workspaceId, SITE_SUPERVISOR)).resolves.toBeNull();
    const removed = await prisma.constructionOrganizationRole.findUniqueOrThrow(
      {
        where: { id: supervisorId },
        include: { permissions: true },
      },
    );
    expect(removed.deletedAt).not.toBeNull();
    expect(removed.permissions).toHaveLength(1);
    await expect(
      prisma.constructionOrganizationAuditEvent.findFirstOrThrow({
        where: { workspaceId, action: "role.deleted", entityId: supervisorId },
      }),
    ).resolves.toMatchObject({
      before: { name: SITE_SUPERVISOR, movedTo: engineer?.id },
      after: null,
    });

    // Its live member is on Site Engineer now; a removed one is left alone.
    const moved =
      await prisma.constructionOrganizationTeamMember.findUniqueOrThrow({
        where: { id: member.id },
      });
    expect(moved).toMatchObject({ roleId: engineer?.id, updatedBy: "system" });
    await expect(
      prisma.constructionOrganizationAuditEvent.findFirstOrThrow({
        where: {
          workspaceId,
          action: "team_member.role_changed",
          entityId: member.id,
        },
      }),
    ).resolves.toMatchObject({
      before: { roleId: supervisorId },
      after: { name: "Murugan Pillai", roleId: engineer?.id },
    });
    await expect(
      prisma.constructionOrganizationTeamMember.findUniqueOrThrow({
        where: { id: gone.id },
      }),
    ).resolves.toMatchObject({ roleId: supervisorId });
  });

  it("leaves a Company's own Labour Role and a Site Engineer it already put under a Department", async () => {
    const workspaceId = await newCompany("Sri Balaji Builders");
    await asBefore(workspaceId);
    const own = await prisma.constructionOrganizationRole.create({
      data: {
        id: randomUUID(),
        workspaceId,
        name: "labour",
        createdBy: "user-1",
        updatedBy: "user-1",
      },
    });
    const marketing =
      await prisma.constructionOrganizationDepartment.findFirstOrThrow({
        where: { workspaceId, name: "Marketing" },
      });
    await prisma.constructionOrganizationRole.updateMany({
      where: { workspaceId, name: SITE_ENGINEER_ROLE },
      data: { departmentId: marketing.id },
    });

    await runMigration([workspaceId]);
    await runMigration([workspaceId]);

    const named = await prisma.constructionOrganizationRole.findMany({
      where: {
        workspaceId,
        name: { equals: LABOUR_ROLE, mode: "insensitive" },
      },
    });
    expect(named).toEqual([
      expect.objectContaining({
        id: own.id,
        isSeed: false,
        departmentId: null,
      }),
    ]);
    // Run twice, still one Vendor.
    await expect(
      prisma.constructionOrganizationRole.count({
        where: { workspaceId, name: VENDOR_ROLE },
      }),
    ).resolves.toBe(1);
    await expect(
      liveRole(workspaceId, SITE_ENGINEER_ROLE),
    ).resolves.toMatchObject({ departmentId: marketing.id });
  });

  it("keeps Site Supervisor in a Company with no live Site Engineer Role", async () => {
    const workspaceId = await newCompany("Kaveri Steel");
    const supervisorId = await asBefore(workspaceId);
    const member = await memberOn(workspaceId, supervisorId, "Selvam K");
    await prisma.constructionOrganizationRole.updateMany({
      where: { workspaceId, name: SITE_ENGINEER_ROLE },
      data: { deletedAt: new Date() },
    });

    await runMigration([workspaceId]);

    await expect(liveRole(workspaceId, SITE_SUPERVISOR)).resolves.toMatchObject(
      { id: supervisorId },
    );
    await expect(
      prisma.constructionOrganizationTeamMember.findUniqueOrThrow({
        where: { id: member.id },
      }),
    ).resolves.toMatchObject({ roleId: supervisorId });
  });
});
