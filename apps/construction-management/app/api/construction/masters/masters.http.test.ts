import { prisma } from "@repo/db";
import { StatusCodes } from "http-status-codes";
import { describe, expect, it } from "vitest";

import { GET as getOpenApi } from "@/app/api/openapi.json/route";
import { seedCompanyMasters } from "@/src/masters/infrastructure/seed-company-masters";
import { newId } from "@/src/shared-kernel/ids";
import { jsonRequest, memberWith, ownerWithCompany } from "@/test/companies";
import { TEST_ORIGIN } from "@/test/sessions";

import { POST as deleteDepartment } from "./departments/[id]/delete/route";
import { POST as disableDepartment } from "./departments/[id]/disable/route";
import { POST as enableDepartment } from "./departments/[id]/enable/route";
import { GET as getDepartment } from "./departments/[id]/route";
import { POST as updateDepartment } from "./departments/[id]/update/route";
import {
  GET as listDepartments,
  POST as createDepartment,
} from "./departments/route";
import { POST as deleteCategory } from "./labour-categories/[id]/delete/route";
import { POST as disableCategory } from "./labour-categories/[id]/disable/route";
import { POST as enableCategory } from "./labour-categories/[id]/enable/route";
import { GET as getCategory } from "./labour-categories/[id]/route";
import { POST as updateCategory } from "./labour-categories/[id]/update/route";
import {
  GET as listCategories,
  POST as createCategory,
} from "./labour-categories/route";
import { POST as deleteSupervisor } from "./supervisors/[id]/delete/route";
import { POST as disableSupervisor } from "./supervisors/[id]/disable/route";
import { POST as enableSupervisor } from "./supervisors/[id]/enable/route";
import { GET as getSupervisor } from "./supervisors/[id]/route";
import { POST as updateSupervisor } from "./supervisors/[id]/update/route";
import {
  GET as listSupervisors,
  POST as createSupervisor,
} from "./supervisors/route";

const BASE = `${TEST_ORIGIN}/api/construction/masters`;
const CATEGORIES = `${BASE}/labour-categories`;
const DEPARTMENTS = `${BASE}/departments`;
const SUPERVISORS = `${BASE}/supervisors`;

type Lookup = {
  id: string;
  name: string;
  isSeed: boolean;
  disabled: boolean;
  createdAt: string;
  updatedAt: string;
};

type SupervisorBody = {
  id: string;
  name: string;
  mobile: string | null;
  teamMemberId: string | null;
  teamMemberName: string | null;
  disabled: boolean;
  updatedAt: string;
};

function params(id: string) {
  return { params: Promise.resolve({ id }) };
}

async function json<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

async function listOf<T>(
  list: (request: Request) => Promise<Response>,
  url: string,
  cookie: string,
): Promise<T[]> {
  const response = await list(jsonRequest(url, cookie));
  expect(response.status).toBe(StatusCodes.OK);
  const body = await json<{ items: T[]; total: number }>(response);
  expect(body.total).toBe(body.items.length);
  return body.items;
}

/** A labourer row in the labour context pointing at a category and a Supervisor. */
async function labourUsing(
  workspaceId: string,
  refs: { labourCategoryId?: string; supervisorId?: string },
): Promise<string> {
  const id = newId();
  await prisma.constructionLabourLabour.create({
    data: {
      id,
      workspaceId,
      name: "Ramesh Jadhav",
      joiningDate: new Date("2026-10-01"),
      wageType: "daily",
      wagePerDay: 80_000,
      overtimeWagePerHour: 10_000,
      currentProjectId: newId(),
      createdBy: "test",
      updatedBy: "test",
      ...refs,
    },
  });
  return id;
}

describe("Masters HTTP (CM-203)", () => {
  it("is 401 without a Session", async () => {
    for (const [list, url] of [
      [listCategories, CATEGORIES],
      [listDepartments, DEPARTMENTS],
      [listSupervisors, SUPERVISORS],
    ] as const) {
      const response = await list(new Request(url));
      expect(response.status).toBe(StatusCodes.UNAUTHORIZED);
    }
  });

  it("gives a new Company its own seed lists, once", async () => {
    const owner = await ownerWithCompany();
    const categories = await listOf<Lookup>(
      listCategories,
      CATEGORIES,
      owner.cookie,
    );
    expect(categories.map((item) => item.name)).toEqual([
      "Carpenter",
      "Electrician",
      "Helper",
      "Labour",
      "Mason",
      "Plumber",
      "Skilled",
      "Unskilled",
      "Welder",
    ]);
    expect(categories.every((item) => item.isSeed && !item.disabled)).toBe(
      true,
    );
    const departments = await listOf<Lookup>(
      listDepartments,
      DEPARTMENTS,
      owner.cookie,
    );
    expect(departments).toHaveLength(53);
    expect(departments.map((item) => item.name)).toEqual(
      expect.arrayContaining([
        "RCC",
        "Masonry & Plaster",
        "Soil Nail & Gunting",
      ]),
    );
    expect(await listOf(listSupervisors, SUPERVISORS, owner.cookie)).toEqual(
      [],
    );

    // Idempotent: a second run adds nothing.
    await seedCompanyMasters(prisma, {
      workspaceId: owner.workspaceId,
      by: owner.userId,
    });
    expect(
      await prisma.constructionMastersLabourCategory.count({
        where: { workspaceId: owner.workspaceId },
      }),
    ).toBe(9);
    expect(
      await prisma.constructionMastersDepartment.count({
        where: { workspaceId: owner.workspaceId },
      }),
    ).toBe(53);
  });

  it("creates, reads, renames, disables, enables and deletes a Labour Category, with audit", async () => {
    const owner = await ownerWithCompany();
    const created = await createCategory(
      jsonRequest(CATEGORIES, owner.cookie, { name: "  Bar   Bender " }),
    );
    expect(created.status).toBe(StatusCodes.CREATED);
    const category = await json<Lookup>(created);
    expect(category).toMatchObject({
      name: "Bar Bender",
      isSeed: false,
      disabled: false,
    });

    const read = await getCategory(
      jsonRequest(`${CATEGORIES}/${category.id}`, owner.cookie),
      params(category.id),
    );
    expect(await json(read)).toEqual(category);

    const renamed = await updateCategory(
      jsonRequest(`${CATEGORIES}/${category.id}/update`, owner.cookie, {
        name: "Steel Fixer",
        expectedUpdatedAt: category.updatedAt,
      }),
      params(category.id),
    );
    expect(renamed.status).toBe(StatusCodes.OK);
    const fixer = await json<Lookup>(renamed);
    expect(fixer.name).toBe("Steel Fixer");

    const disabled = await disableCategory(
      jsonRequest(`${CATEGORIES}/${category.id}/disable`, owner.cookie, {}),
      params(category.id),
    );
    expect(await json(disabled)).toMatchObject({ disabled: true });
    const enabledOnly = await listOf<Lookup>(
      listCategories,
      `${CATEGORIES}?status=enabled`,
      owner.cookie,
    );
    expect(enabledOnly.some((item) => item.id === category.id)).toBe(false);
    const disabledOnly = await listOf<Lookup>(
      listCategories,
      `${CATEGORIES}?status=disabled`,
      owner.cookie,
    );
    expect(disabledOnly.map((item) => item.name)).toEqual(["Steel Fixer"]);
    const all = await listOf<Lookup>(listCategories, CATEGORIES, owner.cookie);
    expect(all).toHaveLength(10);
    const names = all.map((item) => item.name);
    expect(names).toEqual([...names].sort());

    const enabled = await enableCategory(
      jsonRequest(`${CATEGORIES}/${category.id}/enable`, owner.cookie, {}),
      params(category.id),
    );
    expect(await json(enabled)).toMatchObject({ disabled: false });

    const deleted = await deleteCategory(
      jsonRequest(`${CATEGORIES}/${category.id}/delete`, owner.cookie, {}),
      params(category.id),
    );
    expect(deleted.status).toBe(StatusCodes.NO_CONTENT);
    const gone = await getCategory(
      jsonRequest(`${CATEGORIES}/${category.id}`, owner.cookie),
      params(category.id),
    );
    expect(gone.status).toBe(StatusCodes.NOT_FOUND);
    expect(await json(gone)).toMatchObject({
      code: "LABOUR_CATEGORY_NOT_FOUND",
    });
    const row = await prisma.constructionMastersLabourCategory.findUnique({
      where: { id: category.id },
    });
    expect(row).toMatchObject({ deletedBy: owner.userId });
    expect(row?.deletedAt).not.toBeNull();

    // The name is free again once the row is a tombstone.
    const again = await createCategory(
      jsonRequest(CATEGORIES, owner.cookie, { name: "Steel Fixer" }),
    );
    expect(again.status).toBe(StatusCodes.CREATED);

    const audit = await prisma.constructionOrganizationAuditEvent.findMany({
      where: { workspaceId: owner.workspaceId, entityId: category.id },
      orderBy: { occurredAt: "asc" },
    });
    expect(audit.map((event) => event.action)).toEqual([
      "labour_category.created",
      "labour_category.updated",
      "labour_category.disabled",
      "labour_category.enabled",
      "labour_category.deleted",
    ]);
    expect(audit[1]?.before).toMatchObject({ name: "Bar Bender" });
    expect(audit[1]?.after).toMatchObject({ name: "Steel Fixer" });
  });

  it("validates names and is 409 for a name in use, any case", async () => {
    const owner = await ownerWithCompany();
    const blank = await createDepartment(
      jsonRequest(DEPARTMENTS, owner.cookie, { name: "  " }),
    );
    expect(blank.status).toBe(StatusCodes.BAD_REQUEST);
    expect(await json(blank)).toMatchObject({
      code: "DEPARTMENT_NAME_REQUIRED",
    });
    const long = await createDepartment(
      jsonRequest(DEPARTMENTS, owner.cookie, { name: "x".repeat(101) }),
    );
    expect(await json(long)).toMatchObject({
      code: "DEPARTMENT_NAME_TOO_LONG",
    });
    const taken = await createDepartment(
      jsonRequest(DEPARTMENTS, owner.cookie, { name: "rcc" }),
    );
    expect(taken.status).toBe(StatusCodes.CONFLICT);
    expect(await json(taken)).toMatchObject({
      code: "DEPARTMENT_NAME_IN_USE",
    });

    const fencing = await json<Lookup>(
      await createDepartment(
        jsonRequest(DEPARTMENTS, owner.cookie, { name: "Fencing" }),
      ),
    );
    const renamed = await updateDepartment(
      jsonRequest(`${DEPARTMENTS}/${fencing.id}/update`, owner.cookie, {
        name: "Painting",
        expectedUpdatedAt: fencing.updatedAt,
      }),
      params(fencing.id),
    );
    expect(renamed.status).toBe(StatusCodes.CONFLICT);
    expect(await json(renamed)).toMatchObject({
      code: "DEPARTMENT_NAME_IN_USE",
    });
    const badId = await getDepartment(
      jsonRequest(`${DEPARTMENTS}/not-a-uuid`, owner.cookie),
      params("not-a-uuid"),
    );
    expect(badId.status).toBe(StatusCodes.BAD_REQUEST);
    const badStatus = await listDepartments(
      jsonRequest(`${DEPARTMENTS}?status=hidden`, owner.cookie),
    );
    expect(badStatus.status).toBe(StatusCodes.BAD_REQUEST);
  });

  it("keeps seed rows read-only but lets them be disabled", async () => {
    const owner = await ownerWithCompany();
    const departments = await listOf<Lookup>(
      listDepartments,
      DEPARTMENTS,
      owner.cookie,
    );
    const rcc = departments.find((item) => item.name === "RCC");
    if (rcc == null) throw new Error("No RCC seed");
    const renamed = await updateDepartment(
      jsonRequest(`${DEPARTMENTS}/${rcc.id}/update`, owner.cookie, {
        name: "Concrete",
        expectedUpdatedAt: rcc.updatedAt,
      }),
      params(rcc.id),
    );
    expect(renamed.status).toBe(StatusCodes.CONFLICT);
    expect(await json(renamed)).toMatchObject({ code: "SEED_IS_READ_ONLY" });
    const deleted = await deleteDepartment(
      jsonRequest(`${DEPARTMENTS}/${rcc.id}/delete`, owner.cookie, {}),
      params(rcc.id),
    );
    expect(deleted.status).toBe(StatusCodes.CONFLICT);
    expect(await json(deleted)).toMatchObject({ code: "SEED_IS_READ_ONLY" });

    const disabled = await disableDepartment(
      jsonRequest(`${DEPARTMENTS}/${rcc.id}/disable`, owner.cookie, {}),
      params(rcc.id),
    );
    expect(await json(disabled)).toMatchObject({
      name: "RCC",
      isSeed: true,
      disabled: true,
    });
    // Disabling twice is a no-op, not an error.
    const twice = await disableDepartment(
      jsonRequest(`${DEPARTMENTS}/${rcc.id}/disable`, owner.cookie, {}),
      params(rcc.id),
    );
    expect(twice.status).toBe(StatusCodes.OK);
    const enabled = await enableDepartment(
      jsonRequest(`${DEPARTMENTS}/${rcc.id}/enable`, owner.cookie, {}),
      params(rcc.id),
    );
    expect(await json(enabled)).toMatchObject({ disabled: false });
  });

  it("is 409 CHANGED for a stale expectedUpdatedAt", async () => {
    const owner = await ownerWithCompany();
    const category = await json<Lookup>(
      await createCategory(
        jsonRequest(CATEGORIES, owner.cookie, { name: "Painter" }),
      ),
    );
    const first = await updateCategory(
      jsonRequest(`${CATEGORIES}/${category.id}/update`, owner.cookie, {
        name: "Painter (wall)",
        expectedUpdatedAt: category.updatedAt,
      }),
      params(category.id),
    );
    expect(first.status).toBe(StatusCodes.OK);
    const stale = await updateCategory(
      jsonRequest(`${CATEGORIES}/${category.id}/update`, owner.cookie, {
        name: "Painter (roof)",
        expectedUpdatedAt: category.updatedAt,
      }),
      params(category.id),
    );
    expect(stale.status).toBe(StatusCodes.CONFLICT);
    expect(await json(stale)).toMatchObject({
      code: "LABOUR_CATEGORY_CHANGED",
    });
    const missing = await updateCategory(
      jsonRequest(`${CATEGORIES}/${category.id}/update`, owner.cookie, {
        name: "Painter (roof)",
      }),
      params(category.id),
    );
    expect(missing.status).toBe(StatusCodes.BAD_REQUEST);
  });

  it("will not delete a Labour Category or Supervisor a labourer uses", async () => {
    const owner = await ownerWithCompany();
    const category = await json<Lookup>(
      await createCategory(
        jsonRequest(CATEGORIES, owner.cookie, { name: "Painter" }),
      ),
    );
    const supervisor = await json<SupervisorBody>(
      await createSupervisor(
        jsonRequest(SUPERVISORS, owner.cookie, { name: "Raju Mukadam" }),
      ),
    );
    const labourId = await labourUsing(owner.workspaceId, {
      labourCategoryId: category.id,
      supervisorId: supervisor.id,
    });

    const refusedCategory = await deleteCategory(
      jsonRequest(`${CATEGORIES}/${category.id}/delete`, owner.cookie, {}),
      params(category.id),
    );
    expect(refusedCategory.status).toBe(StatusCodes.CONFLICT);
    expect(await json(refusedCategory)).toMatchObject({
      code: "LABOUR_CATEGORY_IN_USE",
    });
    const refusedSupervisor = await deleteSupervisor(
      jsonRequest(`${SUPERVISORS}/${supervisor.id}/delete`, owner.cookie, {}),
      params(supervisor.id),
    );
    expect(refusedSupervisor.status).toBe(StatusCodes.CONFLICT);
    expect(await json(refusedSupervisor)).toMatchObject({
      code: "SUPERVISOR_IN_USE",
    });

    // Once the labourer is gone (a tombstone), both can be deleted.
    await prisma.constructionLabourLabour.update({
      where: { id: labourId },
      data: { deletedAt: new Date(), deletedBy: "test" },
    });
    const deletedCategory = await deleteCategory(
      jsonRequest(`${CATEGORIES}/${category.id}/delete`, owner.cookie, {}),
      params(category.id),
    );
    expect(deletedCategory.status).toBe(StatusCodes.NO_CONTENT);
    const deletedSupervisor = await deleteSupervisor(
      jsonRequest(`${SUPERVISORS}/${supervisor.id}/delete`, owner.cookie, {}),
      params(supervisor.id),
    );
    expect(deletedSupervisor.status).toBe(StatusCodes.NO_CONTENT);
  });

  it("keeps Supervisors with a mobile and an optional Team Member", async () => {
    const owner = await ownerWithCompany();
    const ownerMember =
      await prisma.constructionOrganizationTeamMember.findFirst({
        where: { workspaceId: owner.workspaceId, isOwner: true },
      });
    if (ownerMember == null) throw new Error("No Owner Team Member");

    const created = await createSupervisor(
      jsonRequest(SUPERVISORS, owner.cookie, {
        name: "Ramesh Patil",
        mobile: "98765 43210",
        teamMemberId: ownerMember.id,
      }),
    );
    expect(created.status).toBe(StatusCodes.CREATED);
    const supervisor = await json<SupervisorBody>(created);
    expect(supervisor).toMatchObject({
      name: "Ramesh Patil",
      mobile: "+919876543210",
      teamMemberId: ownerMember.id,
      teamMemberName: ownerMember.name,
      disabled: false,
    });

    const badMobile = await createSupervisor(
      jsonRequest(SUPERVISORS, owner.cookie, { name: "Raju", mobile: "123" }),
    );
    expect(badMobile.status).toBe(StatusCodes.BAD_REQUEST);
    expect(await json(badMobile)).toMatchObject({ code: "MOBILE_INVALID" });

    const other = await ownerWithCompany("Kale Constructions");
    const theirMember =
      await prisma.constructionOrganizationTeamMember.findFirst({
        where: { workspaceId: other.workspaceId, isOwner: true },
      });
    const foreign = await createSupervisor(
      jsonRequest(SUPERVISORS, owner.cookie, {
        name: "Raju",
        teamMemberId: theirMember?.id,
      }),
    );
    expect(foreign.status).toBe(StatusCodes.BAD_REQUEST);
    expect(await json(foreign)).toMatchObject({
      code: "SUPERVISOR_TEAM_MEMBER_NOT_FOUND",
    });

    const sameName = await createSupervisor(
      jsonRequest(SUPERVISORS, owner.cookie, { name: "ramesh patil" }),
    );
    expect(sameName.status).toBe(StatusCodes.CONFLICT);
    expect(await json(sameName)).toMatchObject({
      code: "SUPERVISOR_NAME_IN_USE",
    });

    const updated = await updateSupervisor(
      jsonRequest(`${SUPERVISORS}/${supervisor.id}/update`, owner.cookie, {
        name: "Ramesh P.",
        mobile: null,
        teamMemberId: null,
        expectedUpdatedAt: supervisor.updatedAt,
      }),
      params(supervisor.id),
    );
    expect(updated.status).toBe(StatusCodes.OK);
    expect(await json(updated)).toMatchObject({
      name: "Ramesh P.",
      mobile: null,
      teamMemberId: null,
      teamMemberName: null,
    });
    const stale = await updateSupervisor(
      jsonRequest(`${SUPERVISORS}/${supervisor.id}/update`, owner.cookie, {
        name: "Ramesh",
        expectedUpdatedAt: supervisor.updatedAt,
      }),
      params(supervisor.id),
    );
    expect(await json(stale)).toMatchObject({ code: "SUPERVISOR_CHANGED" });

    const disabled = await disableSupervisor(
      jsonRequest(`${SUPERVISORS}/${supervisor.id}/disable`, owner.cookie, {}),
      params(supervisor.id),
    );
    expect(await json(disabled)).toMatchObject({ disabled: true });
    expect(
      await listOf(
        listSupervisors,
        `${SUPERVISORS}?status=enabled`,
        owner.cookie,
      ),
    ).toEqual([]);
    const enabled = await enableSupervisor(
      jsonRequest(`${SUPERVISORS}/${supervisor.id}/enable`, owner.cookie, {}),
      params(supervisor.id),
    );
    expect(await json(enabled)).toMatchObject({ disabled: false });
    const read = await getSupervisor(
      jsonRequest(`${SUPERVISORS}/${supervisor.id}`, owner.cookie),
      params(supervisor.id),
    );
    expect(read.status).toBe(StatusCodes.OK);
  });

  it("does not show or change another Company's rows", async () => {
    const mine = await ownerWithCompany();
    const theirs = await ownerWithCompany("Kale Constructions");
    const [their] = await listOf<Lookup>(
      listCategories,
      CATEGORIES,
      theirs.cookie,
    );
    const id = their?.id ?? "";
    const read = await getCategory(
      jsonRequest(`${CATEGORIES}/${id}`, mine.cookie),
      params(id),
    );
    expect(read.status).toBe(StatusCodes.NOT_FOUND);
    const disabled = await disableCategory(
      jsonRequest(`${CATEGORIES}/${id}/disable`, mine.cookie, {}),
      params(id),
    );
    expect(disabled.status).toBe(StatusCodes.NOT_FOUND);
    const theirSupervisor = await json<SupervisorBody>(
      await createSupervisor(
        jsonRequest(SUPERVISORS, theirs.cookie, { name: "Raju" }),
      ),
    );
    const updated = await updateSupervisor(
      jsonRequest(`${SUPERVISORS}/${theirSupervisor.id}/update`, mine.cookie, {
        name: "Mine now",
        expectedUpdatedAt: theirSupervisor.updatedAt,
      }),
      params(theirSupervisor.id),
    );
    expect(updated.status).toBe(StatusCodes.NOT_FOUND);
    // The same name in two Companies is fine.
    const same = await createSupervisor(
      jsonRequest(SUPERVISORS, mine.cookie, { name: "Raju" }),
    );
    expect(same.status).toBe(StatusCodes.CREATED);
  });

  it("checks each list's Menu in the Permission Matrix", async () => {
    const company = await ownerWithCompany();
    const reader = await memberWith(company, {
      "masters.labour_categories": ["read"],
      "masters.labours": ["read", "create"],
    });
    expect(
      await listOf(listCategories, CATEGORIES, reader.cookie),
    ).toHaveLength(9);
    const refused = await createCategory(
      jsonRequest(CATEGORIES, reader.cookie, { name: "Painter" }),
    );
    expect(refused.status).toBe(StatusCodes.FORBIDDEN);
    expect(await json(refused)).toMatchObject({ code: "PERMISSION_DENIED" });
    const departments = await listDepartments(
      jsonRequest(DEPARTMENTS, reader.cookie),
    );
    expect(departments.status).toBe(StatusCodes.FORBIDDEN);
    const supervisor = await createSupervisor(
      jsonRequest(SUPERVISORS, reader.cookie, { name: "Raju" }),
    );
    expect(supervisor.status).toBe(StatusCodes.CREATED);
    const { id } = await json<SupervisorBody>(supervisor);
    const deleted = await deleteSupervisor(
      jsonRequest(`${SUPERVISORS}/${id}/delete`, reader.cookie, {}),
      params(id),
    );
    expect(deleted.status).toBe(StatusCodes.FORBIDDEN);
  });

  it("is on /api/docs", async () => {
    const spec = await json<{
      paths: Record<string, Record<string, { tags: string[] }>>;
      components: { schemas: Record<string, unknown> };
    }>(getOpenApi());
    for (const list of ["labour-categories", "departments", "supervisors"]) {
      const path = `/api/construction/masters/${list}`;
      for (const suffix of [
        "",
        "/{id}",
        "/{id}/update",
        "/{id}/disable",
        "/{id}/enable",
        "/{id}/delete",
      ])
        expect(spec.paths[`${path}${suffix}`]).toBeDefined();
      expect(spec.paths[path]?.["get"]?.tags).toEqual([
        "Construction · Masters",
      ]);
    }
    expect(Object.keys(spec.components.schemas)).toEqual(
      expect.arrayContaining([
        "ListConstructionMastersLabourCategoriesResponse",
        "ConstructionMastersLabourCategoryResponse",
        "CreateConstructionMastersLabourCategoryRequest",
        "UpdateConstructionMastersLabourCategoryRequest",
        "ListConstructionMastersDepartmentsResponse",
        "ConstructionMastersDepartmentResponse",
        "CreateConstructionMastersDepartmentRequest",
        "UpdateConstructionMastersDepartmentRequest",
        "ListConstructionMastersSupervisorsResponse",
        "ConstructionMastersSupervisorResponse",
        "CreateConstructionMastersSupervisorRequest",
        "UpdateConstructionMastersSupervisorRequest",
      ]),
    );
  });
});
