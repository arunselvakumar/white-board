import { readFileSync } from "node:fs";
import { join } from "node:path";

import { prisma } from "@repo/construction-db";
import { StatusCodes } from "http-status-codes";
import { describe, expect, it } from "vitest";

import { GET as getOpenApi } from "@/app/api/openapi.json/route";
import { jsonRequest, memberWith, ownerWithCompany } from "@/test/companies";
import { TEST_ORIGIN } from "@/test/sessions";

import { POST as deleteRole } from "../roles/[id]/delete/route";
import { POST as updateRole } from "../roles/[id]/update/route";
import { POST as createRole } from "../roles/route";
import { POST as deleteDepartment } from "./[id]/delete/route";
import { POST as updateDepartment } from "./[id]/update/route";
import { GET as listDepartments, POST as createDepartment } from "./route";

const BASE = `${TEST_ORIGIN}/api/construction/organization/departments`;

const MIGRATION = join(
  __dirname,
  "../../../../../../../packages/db/construction/prisma/migrations/20261125100000_construction_organization_departments/migration.sql",
);

type Department = {
  id: string;
  name: string;
  isSystem: boolean;
  createdAt: string;
  updatedAt: string;
};

async function json<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

function params(id: string) {
  return { params: Promise.resolve({ id }) };
}

async function list(cookie: string): Promise<Department[]> {
  const response = await listDepartments(jsonRequest(BASE, cookie));
  expect(response.status).toBe(StatusCodes.OK);
  return (await json<{ items: Department[] }>(response)).items;
}

function create(cookie: string, name: string) {
  return createDepartment(jsonRequest(BASE, cookie, { name }));
}

function rename(cookie: string, department: Department, name: string) {
  return updateDepartment(
    jsonRequest(`${BASE}/${department.id}/update`, cookie, {
      name,
      expectedUpdatedAt: department.updatedAt,
    }),
    params(department.id),
  );
}

function remove(cookie: string, department: Department) {
  return deleteDepartment(
    jsonRequest(`${BASE}/${department.id}/delete`, cookie, {}),
    params(department.id),
  );
}

describe("Manage Departments HTTP (ADR CM-0049)", () => {
  it("is 401 without a Session", async () => {
    const response = await listDepartments(new Request(BASE));
    expect(response.status).toBe(StatusCodes.UNAUTHORIZED);
  });

  it("starts every new Company with Human Resources and Marketing as system departments", async () => {
    const owner = await ownerWithCompany();
    expect(await list(owner.cookie)).toEqual([
      expect.objectContaining({ name: "Human Resources", isSystem: true }),
      expect.objectContaining({ name: "Marketing", isSystem: true }),
    ]);
  });

  it("adds, renames and deletes a Company-made department, audited", async () => {
    const owner = await ownerWithCompany();
    const created = await create(owner.cookie, "  Accounts   Team ");
    expect(created.status).toBe(StatusCodes.CREATED);
    const accounts = await json<Department>(created);
    expect(accounts).toMatchObject({ name: "Accounts Team", isSystem: false });
    expect((await list(owner.cookie)).map((item) => item.name)).toEqual([
      "Accounts Team",
      "Human Resources",
      "Marketing",
    ]);

    const renamed = await rename(owner.cookie, accounts, "Accounts");
    expect(renamed.status).toBe(StatusCodes.OK);
    const saved = await json<Department>(renamed);
    expect(saved.name).toBe("Accounts");

    const stale = await rename(owner.cookie, accounts, "Late");
    expect(stale.status).toBe(StatusCodes.CONFLICT);
    expect(await json(stale)).toMatchObject({ code: "STALE_DEPARTMENT" });

    const deleted = await remove(owner.cookie, saved);
    expect(deleted.status).toBe(StatusCodes.NO_CONTENT);
    expect((await list(owner.cookie)).map((item) => item.name)).toEqual([
      "Human Resources",
      "Marketing",
    ]);
    // The name is free again.
    expect((await create(owner.cookie, "accounts")).status).toBe(
      StatusCodes.CREATED,
    );

    const events = await prisma.constructionOrganizationAuditEvent.findMany({
      where: {
        workspaceId: owner.workspaceId,
        entityType: "department",
        entityId: accounts.id,
      },
      orderBy: { occurredAt: "asc" },
    });
    expect(events.map((event) => event.action)).toEqual([
      "department.created",
      "department.renamed",
      "department.deleted",
    ]);
  });

  it("refuses a blank, too long or taken name (any case)", async () => {
    const owner = await ownerWithCompany();
    for (const [name, code] of [
      ["   ", "DEPARTMENT_NAME_REQUIRED"],
      ["x".repeat(101), "DEPARTMENT_NAME_TOO_LONG"],
    ] as const) {
      const response = await create(owner.cookie, name);
      expect(response.status).toBe(StatusCodes.BAD_REQUEST);
      expect(await json(response)).toMatchObject({ code });
    }
    const taken = await create(owner.cookie, "human resources");
    expect(taken.status).toBe(StatusCodes.CONFLICT);
    expect(await json(taken)).toMatchObject({ code: "DEPARTMENT_NAME_TAKEN" });

    const purchase = await json<Department>(
      await create(owner.cookie, "Purchase"),
    );
    const clash = await rename(owner.cookie, purchase, "MARKETING");
    expect(clash.status).toBe(StatusCodes.CONFLICT);
    expect(await json(clash)).toMatchObject({ code: "DEPARTMENT_NAME_TAKEN" });
  });

  it("never renames or deletes a system department", async () => {
    const owner = await ownerWithCompany();
    const [humanResources] = await list(owner.cookie);
    if (humanResources == null) throw new Error("No Human Resources");

    const renamed = await rename(owner.cookie, humanResources, "People");
    expect(renamed.status).toBe(StatusCodes.BAD_REQUEST);
    expect(await json(renamed)).toMatchObject({
      code: "DEPARTMENT_SYSTEM_LOCKED",
    });

    const deleted = await remove(owner.cookie, humanResources);
    expect(deleted.status).toBe(StatusCodes.CONFLICT);
    expect(await json(deleted)).toMatchObject({
      code: "DEPARTMENT_IS_SYSTEM",
    });
    expect((await list(owner.cookie)).map((item) => item.name)).toEqual([
      "Human Resources",
      "Marketing",
    ]);
  });

  it("checks the Departments menu for each action", async () => {
    const owner = await ownerWithCompany();
    const none = await memberWith(owner, {});
    expect((await listDepartments(jsonRequest(BASE, none.cookie))).status).toBe(
      StatusCodes.FORBIDDEN,
    );

    // The Employee form offers each Employee's Department (ADR CM-0055).
    const employees = await memberWith(owner, { "masters.labours": ["read"] });
    expect(
      (await listDepartments(jsonRequest(BASE, employees.cookie))).status,
    ).toBe(StatusCodes.OK);

    const reader = await memberWith(owner, {
      "organization.departments": ["read"],
    });
    const [humanResources] = await list(reader.cookie);
    if (humanResources == null) throw new Error("No Human Resources");
    expect((await create(reader.cookie, "Accounts")).status).toBe(
      StatusCodes.FORBIDDEN,
    );

    const maker = await memberWith(owner, {
      "organization.departments": ["read", "create"],
    });
    const accounts = await json<Department>(
      await create(maker.cookie, "Accounts"),
    );
    expect((await rename(maker.cookie, accounts, "Books")).status).toBe(
      StatusCodes.FORBIDDEN,
    );
    expect((await remove(maker.cookie, accounts)).status).toBe(
      StatusCodes.FORBIDDEN,
    );
  });

  it("will not delete a department while Roles are under it (ADR CM-0050)", async () => {
    const owner = await ownerWithCompany();
    const accounts = await json<Department>(
      await create(owner.cookie, "Accounts"),
    );
    const roles = `${TEST_ORIGIN}/api/construction/organization/roles`;
    const addRole = async (name: string) =>
      json<{ id: string; updatedAt: string }>(
        await createRole(
          jsonRequest(roles, owner.cookie, {
            name,
            departmentId: accounts.id,
            permissions: {},
          }),
        ),
      );
    const cashier = await addRole("Cashier");
    const clerk = await addRole("Clerk");

    const refused = await remove(owner.cookie, accounts);
    expect(refused.status).toBe(StatusCodes.CONFLICT);
    expect(await json(refused)).toMatchObject({
      code: "DEPARTMENT_IN_USE",
      details: { roleCount: 2 },
    });

    // A deleted Role does not count; a Role moved to none does not either.
    await deleteRole(
      jsonRequest(`${roles}/${cashier.id}/delete`, owner.cookie, {}),
      params(cashier.id),
    );
    await updateRole(
      jsonRequest(`${roles}/${clerk.id}/update`, owner.cookie, {
        name: "Clerk",
        departmentId: null,
        permissions: {},
        updatedAt: clerk.updatedAt,
      }),
      params(clerk.id),
    );
    const [current] = (await list(owner.cookie)).filter(
      (item) => item.id === accounts.id,
    );
    if (current == null) throw new Error("No Accounts");
    expect((await remove(owner.cookie, current)).status).toBe(
      StatusCodes.NO_CONTENT,
    );
  });

  it("keeps each Company's departments to itself", async () => {
    const one = await ownerWithCompany("One");
    const two = await ownerWithCompany("Two");
    const accounts = await json<Department>(
      await create(one.cookie, "Accounts"),
    );
    expect((await list(two.cookie)).map((item) => item.name)).toEqual([
      "Human Resources",
      "Marketing",
    ]);
    const response = await remove(two.cookie, accounts);
    expect(response.status).toBe(StatusCodes.NOT_FOUND);
    expect(await json(response)).toMatchObject({
      code: "DEPARTMENT_NOT_FOUND",
    });
  });

  it("gives the seeded Admin every Departments cell", async () => {
    const owner = await ownerWithCompany();
    const admin =
      await prisma.constructionOrganizationRoleMenuPermission.findFirst({
        where: {
          roleId: owner.roleId("Admin"),
          menu: "organization.departments",
        },
      });
    expect(admin?.flags).toBe(15);
  });

  it("documents its routes in OpenAPI", async () => {
    const document = await json<{ paths: Record<string, unknown> }>(
      getOpenApi(),
    );
    expect(Object.keys(document.paths)).toEqual(
      expect.arrayContaining([
        "/api/construction/organization/departments",
        "/api/construction/organization/departments/{id}/update",
        "/api/construction/organization/departments/{id}/delete",
      ]),
    );
  });
});

describe("the Manage Departments migration (ADR CM-0049)", () => {
  it("adds the system departments to a Company and the Departments cells to its Admin", async () => {
    const owner = await ownerWithCompany();
    // As the Company stood before the release: no Role under a Department
    // yet (the seeds since ADR CM-0054 are).
    await prisma.constructionOrganizationRole.updateMany({
      where: { workspaceId: owner.workspaceId },
      data: { departmentId: null },
    });
    await prisma.constructionOrganizationDepartment.deleteMany({
      where: { workspaceId: owner.workspaceId },
    });
    await prisma.constructionOrganizationRoleMenuPermission.deleteMany({
      where: {
        workspaceId: owner.workspaceId,
        menu: "organization.departments",
      },
    });

    const ids = `'${owner.workspaceId}'`;
    const companies = `FROM "construction_organization"."team_members") c`;
    const admin = `AND r."name" = 'Admin'`;
    const sql = readFileSync(MIGRATION, "utf8");
    if (!sql.includes(companies) || !sql.includes(admin))
      throw new Error("The migration changed shape; update this test");
    const statements = sql
      .slice(sql.indexOf("-- System departments"))
      .replace(
        companies,
        `FROM "construction_organization"."team_members" WHERE "workspace_id" IN (${ids})) c`,
      )
      .replace(admin, `${admin} AND r."workspace_id" IN (${ids})`)
      .split(/;\s*\n/)
      .map((statement) =>
        statement
          .split("\n")
          .filter((line) => !line.trim().startsWith("--"))
          .join("\n")
          .trim(),
      )
      .filter((statement) => statement !== "");
    expect(statements).toHaveLength(2);
    for (const statement of statements)
      await prisma.$executeRawUnsafe(statement);

    expect(await list(owner.cookie)).toEqual([
      expect.objectContaining({ name: "Human Resources", isSystem: true }),
      expect.objectContaining({ name: "Marketing", isSystem: true }),
    ]);
    const cell =
      await prisma.constructionOrganizationRoleMenuPermission.findFirst({
        where: {
          roleId: owner.roleId("Admin"),
          menu: "organization.departments",
        },
      });
    expect(cell?.flags).toBe(15);
  });
});
