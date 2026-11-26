import { prisma } from "@repo/construction-db";
import { StatusCodes } from "http-status-codes";
import { describe, expect, it } from "vitest";

import { GET as listCategories } from "@/app/api/construction/masters/labour-categories/route";
import { POST as deleteDepartment } from "@/app/api/construction/organization/departments/[id]/delete/route";
import { POST as renameDepartment } from "@/app/api/construction/organization/departments/[id]/update/route";
import {
  GET as listDepartments,
  POST as createDepartment,
} from "@/app/api/construction/organization/departments/route";
import { GET as getOpenApi } from "@/app/api/openapi.json/route";
import { jsonRequest, memberWith, ownerWithCompany } from "@/test/companies";
import { TEST_ORIGIN } from "@/test/sessions";

import { POST as deleteRole } from "./[id]/delete/route";
import { POST as duplicateRole } from "./[id]/duplicate/route";
import { GET as getRole } from "./[id]/route";
import { POST as updateRole } from "./[id]/update/route";
import { GET as listRoles, POST as createRole } from "./route";

const BASE = `${TEST_ORIGIN}/api/construction/organization/roles`;

type Role = {
  id: string;
  name: string;
  description: string | null;
  isSeed: boolean;
  department: { id: string; name: string } | null;
  permissions: Record<string, string[]>;
  userCount: number;
  createdAt: string;
  updatedAt: string;
};

async function json<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

function params(id: string) {
  return { params: Promise.resolve({ id }) };
}

async function list(cookie: string): Promise<Role[]> {
  const response = await listRoles(jsonRequest(BASE, cookie));
  expect(response.status).toBe(StatusCodes.OK);
  return (await json<{ items: Role[] }>(response)).items;
}

function update(
  cookie: string,
  role: Role,
  changes: Partial<Role> & { departmentId?: string | null },
) {
  return updateRole(
    jsonRequest(`${BASE}/${role.id}/update`, cookie, {
      name: role.name,
      description: role.description,
      permissions: role.permissions,
      updatedAt: role.updatedAt,
      ...changes,
    }),
    params(role.id),
  );
}

const DEPARTMENTS = `${TEST_ORIGIN}/api/construction/organization/departments`;

type Department = { id: string; name: string; updatedAt: string };

async function addDepartment(
  cookie: string,
  name: string,
): Promise<Department> {
  const response = await createDepartment(
    jsonRequest(DEPARTMENTS, cookie, { name }),
  );
  expect(response.status).toBe(StatusCodes.CREATED);
  return json<Department>(response);
}

describe("Role Management HTTP (ADR CM-0030)", () => {
  it("is 401 without a Session", async () => {
    const response = await listRoles(new Request(BASE));
    expect(response.status).toBe(StatusCodes.UNAUTHORIZED);
  });

  it("lists the ten seed Roles by name, with how many Users are on each", async () => {
    const owner = await ownerWithCompany();
    await memberWith(owner, {});
    const roles = await list(owner.cookie);
    const seeds = roles.filter((role) => role.isSeed);
    expect(seeds.map((role) => role.name)).toEqual(
      [
        "Accountant",
        "Admin",
        "HRMS Staff",
        "Labour",
        "Marketing",
        "Project Manager",
        "Quality Control",
        "Site Engineer",
        "Store Keeper",
        "Structural Engineer",
        "Vendor",
      ].sort(),
    );
    expect(seeds.every((role) => role.userCount === 0)).toBe(true);
    // memberWith made a Role for its member.
    expect(roles.filter((role) => !role.isSeed)).toEqual([
      expect.objectContaining({ userCount: 1 }),
    ]);
    const admin = roles.find((role) => role.name === "Admin");
    expect(admin?.permissions["organization.roles"]).toEqual([
      "create",
      "read",
      "update",
      "delete",
    ]);
    const one = await getRole(
      jsonRequest(`${BASE}/${admin?.id ?? ""}`, owner.cookie),
      params(admin?.id ?? ""),
    );
    expect(await json(one)).toEqual(admin);
  });

  it("creates, updates, duplicates and deletes, audited", async () => {
    const owner = await ownerWithCompany();
    const created = await createRole(
      jsonRequest(BASE, owner.cookie, {
        name: "  Billing   Clerk ",
        description: "Raises bills",
        permissions: {
          "projects.project": ["read", "approve"],
          "finance.petty_cash": [],
        },
      }),
    );
    expect(created.status).toBe(StatusCodes.CREATED);
    const role = await json<Role>(created);
    // Unsupported cells ("approve" on Project) and empty rows are dropped.
    expect(role).toMatchObject({
      name: "Billing Clerk",
      description: "Raises bills",
      isSeed: false,
      userCount: 0,
      permissions: { "projects.project": ["read"] },
    });

    const updated = await update(owner.cookie, role, {
      name: "Billing Clerk II",
      description: null,
      permissions: { "projects.project": ["create", "read"] },
    });
    expect(updated.status).toBe(StatusCodes.OK);
    const saved = await json<Role>(updated);
    expect(saved).toMatchObject({
      name: "Billing Clerk II",
      description: null,
      permissions: { "projects.project": ["create", "read"] },
    });

    const stale = await update(owner.cookie, role, { name: "Late" });
    expect(stale.status).toBe(StatusCodes.CONFLICT);
    expect(await json(stale)).toMatchObject({ code: "STALE_ROLE" });

    const copy = await json<Role>(
      await duplicateRole(
        jsonRequest(`${BASE}/${role.id}/duplicate`, owner.cookie, {}),
        params(role.id),
      ),
    );
    expect(copy).toMatchObject({
      name: "Billing Clerk II (copy)",
      isSeed: false,
      userCount: 0,
      permissions: saved.permissions,
    });
    const second = await duplicateRole(
      jsonRequest(`${BASE}/${role.id}/duplicate`, owner.cookie, {}),
      params(role.id),
    );
    expect(second.status).toBe(StatusCodes.CREATED);
    expect(await json(second)).toMatchObject({
      name: "Billing Clerk II (copy 2)",
    });

    const deleted = await deleteRole(
      jsonRequest(`${BASE}/${copy.id}/delete`, owner.cookie, {}),
      params(copy.id),
    );
    expect(deleted.status).toBe(StatusCodes.NO_CONTENT);
    const gone = await getRole(
      jsonRequest(`${BASE}/${copy.id}`, owner.cookie),
      params(copy.id),
    );
    expect(gone.status).toBe(StatusCodes.NOT_FOUND);
    expect(await json(gone)).toMatchObject({ code: "ROLE_NOT_FOUND" });

    const events = await prisma.constructionOrganizationAuditEvent.findMany({
      where: { workspaceId: owner.workspaceId, entityType: "role" },
      select: { action: true, before: true, after: true },
    });
    expect(events.map((event) => event.action).sort()).toEqual([
      "role.created",
      "role.deleted",
      "role.duplicated",
      "role.duplicated",
      "role.updated",
    ]);
    expect(
      events.find((event) => event.action === "role.updated"),
    ).toMatchObject({
      before: { permissions: { "projects.project": ["read"] } },
      after: { permissions: { "projects.project": ["create", "read"] } },
    });
  });

  it("validates names, unique among live Roles ignoring case", async () => {
    const owner = await ownerWithCompany();
    const taken = await createRole(
      jsonRequest(BASE, owner.cookie, {
        name: "site engineer",
        permissions: {},
      }),
    );
    expect(taken.status).toBe(StatusCodes.CONFLICT);
    expect(await json(taken)).toMatchObject({ code: "ROLE_NAME_TAKEN" });
    const blank = await createRole(
      jsonRequest(BASE, owner.cookie, { name: "  ", permissions: {} }),
    );
    expect(await json(blank)).toMatchObject({ code: "ROLE_NAME_REQUIRED" });
    const long = await createRole(
      jsonRequest(BASE, owner.cookie, {
        name: "x".repeat(101),
        permissions: {},
      }),
    );
    expect(long.status).toBe(StatusCodes.BAD_REQUEST);
    expect(await json(long)).toMatchObject({ code: "ROLE_NAME_TOO_LONG" });
    const unknownMenu = await createRole(
      jsonRequest(BASE, owner.cookie, {
        name: "Surveyor",
        permissions: { "projects.nope": ["read"] },
      }),
    );
    expect(unknownMenu.status).toBe(StatusCodes.BAD_REQUEST);
  });

  it("will not delete a Role with Users on it", async () => {
    const owner = await ownerWithCompany();
    await memberWith(owner, {});
    const held = (await list(owner.cookie)).find((role) => role.userCount > 0);
    const response = await deleteRole(
      jsonRequest(`${BASE}/${held?.id ?? ""}/delete`, owner.cookie, {}),
      params(held?.id ?? ""),
    );
    expect(response.status).toBe(StatusCodes.CONFLICT);
    expect(await json(response)).toMatchObject({
      code: "ROLE_IN_USE",
      details: { userCount: 1 },
    });
  });

  it("gives a new Company the default Marketing Role with only its own Marketing cells, locked like every default (ADR CM-0040 §3)", async () => {
    const owner = await ownerWithCompany();
    const marketing = (await list(owner.cookie)).find(
      (role) => role.name === "Marketing",
    );
    if (marketing == null) throw new Error("No Marketing Role");
    expect(marketing).toMatchObject({ isSeed: true, userCount: 0 });
    expect(marketing.permissions).toEqual({
      "marketing.dashboard": ["read"],
      "marketing.visits": ["create", "read", "update"],
      "marketing.follow_ups": ["create", "read", "update", "notification"],
      "marketing.companies": ["create", "read", "update"],
    });

    const deleted = await deleteRole(
      jsonRequest(`${BASE}/${marketing.id}/delete`, owner.cookie, {}),
      params(marketing.id),
    );
    expect(deleted.status).toBe(StatusCodes.CONFLICT);
    expect(await json(deleted)).toMatchObject({ code: "ROLE_IS_DEFAULT" });
    const renamed = await update(owner.cookie, marketing, {
      name: "Business Development",
    });
    expect(renamed.status).toBe(StatusCodes.BAD_REQUEST);
  });

  it("keeps default Roles: never deleted, never renamed (ADR CM-0037)", async () => {
    const owner = await ownerWithCompany();
    const seed = (await list(owner.cookie)).find(
      (role) => role.name === "Site Engineer",
    );
    if (seed == null) throw new Error("No Site Engineer Role");
    expect(seed).toMatchObject({ isSeed: true, userCount: 0 });

    const deleted = await deleteRole(
      jsonRequest(`${BASE}/${seed.id}/delete`, owner.cookie, {}),
      params(seed.id),
    );
    expect(deleted.status).toBe(StatusCodes.CONFLICT);
    expect(await json(deleted)).toMatchObject({ code: "ROLE_IS_DEFAULT" });

    const renamed = await update(owner.cookie, seed, { name: "Engineer" });
    expect(renamed.status).toBe(StatusCodes.BAD_REQUEST);
    expect(await json(renamed)).toMatchObject({
      code: "ROLE_DEFAULT_NAME_LOCKED",
    });

    // The description and matrix still change.
    const edited = await update(owner.cookie, seed, {
      description: "Runs one site",
      permissions: { "projects.project": ["read"] },
    });
    expect(edited.status).toBe(StatusCodes.OK);
    expect(await json(edited)).toMatchObject({
      name: "Site Engineer",
      description: "Runs one site",
    });
  });

  it("changes access for everyone on the Role from their next request", async () => {
    const owner = await ownerWithCompany();
    const member = await memberWith(owner, {
      "masters.labour_categories": ["read"],
    });
    expect(
      (await listCategories(jsonRequest(`${TEST_ORIGIN}/x`, member.cookie)))
        .status,
    ).toBe(StatusCodes.OK);
    const theirs = (await list(owner.cookie)).find(
      (role) => role.userCount === 1,
    );
    if (theirs == null) throw new Error("No Role with the member on it");
    const saved = await update(owner.cookie, theirs, { permissions: {} });
    expect(saved.status).toBe(StatusCodes.OK);
    const after = await listCategories(
      jsonRequest(`${TEST_ORIGIN}/x`, member.cookie),
    );
    expect(after.status).toBe(StatusCodes.FORBIDDEN);
  });

  it("lets a Member save only cells they hold, never their own Role", async () => {
    const owner = await ownerWithCompany();
    const admin = await memberWith(owner, {
      "organization.roles": ["create", "read", "update", "delete"],
      "labour.attendance": ["create", "read"],
    });
    const extra = await createRole(
      jsonRequest(BASE, admin.cookie, {
        name: "Timekeeper",
        permissions: { "labour.attendance": ["read", "delete"] },
      }),
    );
    expect(extra.status).toBe(StatusCodes.FORBIDDEN);
    expect(await json(extra)).toMatchObject({ code: "CANNOT_GRANT" });
    const created = await createRole(
      jsonRequest(BASE, admin.cookie, {
        name: "Timekeeper",
        permissions: { "labour.attendance": ["read"] },
      }),
    );
    expect(created.status).toBe(StatusCodes.CREATED);
    const timekeeper = await json<Role>(created);
    expect(
      (
        await update(admin.cookie, timekeeper, {
          permissions: { "labour.attendance": ["create", "read"] },
        })
      ).status,
    ).toBe(StatusCodes.OK);

    // Taking away a cell they do not hold is refused too.
    const roles = await list(admin.cookie);
    const engineer = roles.find((role) => role.name === "Site Engineer");
    if (engineer == null) throw new Error("No Site Engineer Role");
    const narrowed = await update(admin.cookie, engineer, { permissions: {} });
    expect(narrowed.status).toBe(StatusCodes.FORBIDDEN);
    expect(await json(narrowed)).toMatchObject({ code: "CANNOT_GRANT" });

    const own = roles.find((role) => role.userCount === 1 && !role.isSeed);
    if (own == null) throw new Error("No Role of the member's own");
    const self = await update(admin.cookie, own, { name: "Mine" });
    expect(self.status).toBe(StatusCodes.FORBIDDEN);
    expect(await json(self)).toMatchObject({ code: "OWN_ROLE" });
  });

  it("lists for Team Members read, refuses others", async () => {
    const owner = await ownerWithCompany();
    const adder = await memberWith(owner, {
      "organization.team_members": ["read", "create"],
    });
    expect(await list(adder.cookie)).not.toHaveLength(0);
    const refused = await createRole(
      jsonRequest(BASE, adder.cookie, { name: "X", permissions: {} }),
    );
    expect(refused.status).toBe(StatusCodes.FORBIDDEN);
    const outsider = await memberWith(owner, {
      "projects.project": ["read"],
    });
    const listed = await listRoles(jsonRequest(BASE, outsider.cookie));
    expect(listed.status).toBe(StatusCodes.FORBIDDEN);
    expect(await json(listed)).toMatchObject({ code: "PERMISSION_DENIED" });
  });

  it("never shows another Company's Role", async () => {
    const mine = await ownerWithCompany();
    const theirs = await ownerWithCompany("Sri Infra");
    const id = theirs.roleId("Admin");
    const read = await getRole(
      jsonRequest(`${BASE}/${id}`, mine.cookie),
      params(id),
    );
    expect(read.status).toBe(StatusCodes.NOT_FOUND);
    const deleted = await deleteRole(
      jsonRequest(`${BASE}/${id}/delete`, mine.cookie, {}),
      params(id),
    );
    expect(deleted.status).toBe(StatusCodes.NOT_FOUND);
  });

  it("is on /api/docs", async () => {
    const spec = await json<{ paths: Record<string, unknown> }>(getOpenApi());
    expect(Object.keys(spec.paths)).toEqual(
      expect.arrayContaining([
        "/api/construction/organization/roles",
        "/api/construction/organization/roles/{id}",
        "/api/construction/organization/roles/{id}/update",
        "/api/construction/organization/roles/{id}/duplicate",
        "/api/construction/organization/roles/{id}/delete",
      ]),
    );
  });
});

describe("A Role under a Department (ADR CM-0050)", () => {
  it("adds a Role under a Department or none, moves it, and copies it with Duplicate", async () => {
    const owner = await ownerWithCompany();
    const accounts = await addDepartment(owner.cookie, "Accounts");
    const purchase = await addDepartment(owner.cookie, "Purchase");

    const none = await createRole(
      jsonRequest(BASE, owner.cookie, { name: "Driver", permissions: {} }),
    );
    expect(await json(none)).toMatchObject({ department: null });

    const created = await createRole(
      jsonRequest(BASE, owner.cookie, {
        name: "Cashier",
        departmentId: accounts.id,
        permissions: {},
      }),
    );
    expect(created.status).toBe(StatusCodes.CREATED);
    const role = await json<Role>(created);
    expect(role.department).toEqual({ id: accounts.id, name: "Accounts" });

    // Leaving departmentId out keeps it.
    const kept = await updateRole(
      jsonRequest(`${BASE}/${role.id}/update`, owner.cookie, {
        name: "Cashier",
        permissions: {},
        updatedAt: role.updatedAt,
      }),
      params(role.id),
    );
    const keptRole = await json<Role>(kept);
    expect(keptRole.department).toEqual({ id: accounts.id, name: "Accounts" });

    const moved = await json<Role>(
      await update(owner.cookie, keptRole, { departmentId: purchase.id }),
    );
    expect(moved.department).toEqual({ id: purchase.id, name: "Purchase" });

    const copy = await json<Role>(
      await duplicateRole(
        jsonRequest(`${BASE}/${role.id}/duplicate`, owner.cookie, {}),
        params(role.id),
      ),
    );
    expect(copy.department).toEqual({ id: purchase.id, name: "Purchase" });

    // A rename of the Department shows on its Roles at once.
    await renameDepartment(
      jsonRequest(`${DEPARTMENTS}/${purchase.id}/update`, owner.cookie, {
        name: "Stores",
        expectedUpdatedAt: purchase.updatedAt,
      }),
      params(purchase.id),
    );
    const listed = await list(owner.cookie);
    expect(listed.find((item) => item.id === role.id)?.department).toEqual({
      id: purchase.id,
      name: "Stores",
    });

    const cleared = await json<Role>(
      await update(owner.cookie, moved, { departmentId: null }),
    );
    expect(cleared.department).toBeNull();

    const audit = await prisma.constructionOrganizationAuditEvent.findMany({
      where: { workspaceId: owner.workspaceId, entityId: role.id },
      select: { after: true },
    });
    expect(
      audit
        .map((event) =>
          String((event.after as { departmentId: string | null }).departmentId),
        )
        .sort(),
    ).toEqual([accounts.id, accounts.id, purchase.id, "null"].sort());
  });

  it("refuses a Department that is unknown, deleted or another Company's", async () => {
    const owner = await ownerWithCompany();
    const other = await ownerWithCompany("Sri Infra");
    const theirs = await addDepartment(other.cookie, "Accounts");
    const gone = await addDepartment(owner.cookie, "Old");
    await deleteDepartment(
      jsonRequest(`${DEPARTMENTS}/${gone.id}/delete`, owner.cookie, {}),
      params(gone.id),
    );
    for (const departmentId of [
      theirs.id,
      gone.id,
      "0199c3a0-0000-7000-8000-00000000dead",
    ]) {
      const response = await createRole(
        jsonRequest(BASE, owner.cookie, {
          name: "Clerk",
          departmentId,
          permissions: {},
        }),
      );
      expect(response.status).toBe(StatusCodes.BAD_REQUEST);
      expect(await json(response)).toMatchObject({
        code: "ROLE_DEPARTMENT_NOT_FOUND",
      });
    }
    const notUuid = await createRole(
      jsonRequest(BASE, owner.cookie, {
        name: "Clerk",
        departmentId: "accounts",
        permissions: {},
      }),
    );
    expect(notUuid.status).toBe(StatusCodes.BAD_REQUEST);
    expect(
      (await list(owner.cookie)).some((role) => role.name === "Clerk"),
    ).toBe(false);
  });

  it("lets whoever adds Roles read the Departments to choose from", async () => {
    const owner = await ownerWithCompany();
    const roleAdmin = await memberWith(owner, {
      "organization.roles": ["read", "create"],
    });
    const response = await listDepartments(
      jsonRequest(DEPARTMENTS, roleAdmin.cookie),
    );
    expect(response.status).toBe(StatusCodes.OK);
    expect(
      (await json<{ items: Department[] }>(response)).items.map(
        (item) => item.name,
      ),
    ).toEqual(["Human Resources", "Marketing"]);
    expect(
      (
        await createDepartment(
          jsonRequest(DEPARTMENTS, roleAdmin.cookie, { name: "Accounts" }),
        )
      ).status,
    ).toBe(StatusCodes.FORBIDDEN);
  });
});
