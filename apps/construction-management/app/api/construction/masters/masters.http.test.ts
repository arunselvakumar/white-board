import { prisma } from "@repo/construction-db";
import { StatusCodes } from "http-status-codes";
import { describe, expect, it } from "vitest";

import { GET as getOpenApi } from "@/app/api/openapi.json/route";
import { seedCompanyMasters } from "@/src/masters/infrastructure/seed-company-masters";
import { newId } from "@/src/shared-kernel/ids";
import { jsonRequest, memberWith, ownerWithCompany } from "@/test/companies";
import { seedEmployee } from "@/test/employees";
import { TEST_ORIGIN } from "@/test/sessions";

import { POST as deleteCategory } from "./labour-categories/[id]/delete/route";
import { POST as disableCategory } from "./labour-categories/[id]/disable/route";
import { POST as enableCategory } from "./labour-categories/[id]/enable/route";
import { GET as getCategory } from "./labour-categories/[id]/route";
import { POST as updateCategory } from "./labour-categories/[id]/update/route";
import {
  GET as listCategories,
  POST as createCategory,
} from "./labour-categories/route";

const BASE = `${TEST_ORIGIN}/api/construction/masters`;
const CATEGORIES = `${BASE}/labour-categories`;

type Lookup = {
  id: string;
  name: string;
  skill?: string;
  isSeed: boolean;
  disabled: boolean;
  createdAt: string;
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

describe("Masters HTTP (CM-203)", () => {
  it("is 401 without a Session", async () => {
    const response = await listCategories(new Request(CATEGORIES));
    expect(response.status).toBe(StatusCodes.UNAUTHORIZED);
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
    // Helper, Labour and Unskilled count as unskilled heads (CM-0016 §6).
    expect(
      categories
        .filter((item) => item.skill === "unskilled")
        .map((item) => item.name),
    ).toEqual(["Helper", "Labour", "Unskilled"]);
    expect(categories.filter((item) => item.skill === "skilled")).toHaveLength(
      6,
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
    // The RCC Work Type, once.
    expect(
      await prisma.constructionMastersWorkType.findMany({
        where: { workspaceId: owner.workspaceId },
        select: { name: true, isSeed: true },
      }),
    ).toEqual([{ name: "RCC", isSeed: true }]);
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
    const blank = await createCategory(
      jsonRequest(CATEGORIES, owner.cookie, { name: "  " }),
    );
    expect(blank.status).toBe(StatusCodes.BAD_REQUEST);
    expect(await json(blank)).toMatchObject({
      code: "LABOUR_CATEGORY_NAME_REQUIRED",
    });
    const long = await createCategory(
      jsonRequest(CATEGORIES, owner.cookie, { name: "x".repeat(101) }),
    );
    expect(await json(long)).toMatchObject({
      code: "LABOUR_CATEGORY_NAME_TOO_LONG",
    });
    const taken = await createCategory(
      jsonRequest(CATEGORIES, owner.cookie, { name: "mason" }),
    );
    expect(taken.status).toBe(StatusCodes.CONFLICT);
    expect(await json(taken)).toMatchObject({
      code: "LABOUR_CATEGORY_NAME_IN_USE",
    });

    const fencer = await json<Lookup>(
      await createCategory(
        jsonRequest(CATEGORIES, owner.cookie, { name: "Fencer" }),
      ),
    );
    const renamed = await updateCategory(
      jsonRequest(`${CATEGORIES}/${fencer.id}/update`, owner.cookie, {
        name: "Plumber",
        expectedUpdatedAt: fencer.updatedAt,
      }),
      params(fencer.id),
    );
    expect(renamed.status).toBe(StatusCodes.CONFLICT);
    expect(await json(renamed)).toMatchObject({
      code: "LABOUR_CATEGORY_NAME_IN_USE",
    });
    const badId = await getCategory(
      jsonRequest(`${CATEGORIES}/not-a-uuid`, owner.cookie),
      params("not-a-uuid"),
    );
    expect(badId.status).toBe(StatusCodes.BAD_REQUEST);
    const badStatus = await listCategories(
      jsonRequest(`${CATEGORIES}?status=hidden`, owner.cookie),
    );
    expect(badStatus.status).toBe(StatusCodes.BAD_REQUEST);
  });

  it("keeps seed rows read-only but lets them be disabled", async () => {
    const owner = await ownerWithCompany();
    const categories = await listOf<Lookup>(
      listCategories,
      CATEGORIES,
      owner.cookie,
    );
    const mason = categories.find((item) => item.name === "Mason");
    if (mason == null) throw new Error("No Mason seed");
    const renamed = await updateCategory(
      jsonRequest(`${CATEGORIES}/${mason.id}/update`, owner.cookie, {
        name: "Brick Mason",
        expectedUpdatedAt: mason.updatedAt,
      }),
      params(mason.id),
    );
    expect(renamed.status).toBe(StatusCodes.CONFLICT);
    expect(await json(renamed)).toMatchObject({ code: "SEED_IS_READ_ONLY" });
    const deleted = await deleteCategory(
      jsonRequest(`${CATEGORIES}/${mason.id}/delete`, owner.cookie, {}),
      params(mason.id),
    );
    expect(deleted.status).toBe(StatusCodes.CONFLICT);
    expect(await json(deleted)).toMatchObject({ code: "SEED_IS_READ_ONLY" });

    const disabled = await disableCategory(
      jsonRequest(`${CATEGORIES}/${mason.id}/disable`, owner.cookie, {}),
      params(mason.id),
    );
    expect(await json(disabled)).toMatchObject({
      name: "Mason",
      isSeed: true,
      disabled: true,
    });
    // Disabling twice is a no-op, not an error.
    const twice = await disableCategory(
      jsonRequest(`${CATEGORIES}/${mason.id}/disable`, owner.cookie, {}),
      params(mason.id),
    );
    expect(twice.status).toBe(StatusCodes.OK);
    const enabled = await enableCategory(
      jsonRequest(`${CATEGORIES}/${mason.id}/enable`, owner.cookie, {}),
      params(mason.id),
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

  it("will not delete a Labour Category an Employee or an overtime line uses", async () => {
    const owner = await ownerWithCompany();
    const category = await json<Lookup>(
      await createCategory(
        jsonRequest(CATEGORIES, owner.cookie, { name: "Painter" }),
      ),
    );
    const employeeId = await seedEmployee({
      workspaceId: owner.workspaceId,
      labourCategoryId: category.id,
    });
    const deleteIt = () =>
      deleteCategory(
        jsonRequest(`${CATEGORIES}/${category.id}/delete`, owner.cookie, {}),
        params(category.id),
      );

    const refused = await deleteIt();
    expect(refused.status).toBe(StatusCodes.CONFLICT);
    expect(await json(refused)).toMatchObject({
      code: "LABOUR_CATEGORY_IN_USE",
    });

    // Overtime on a live attendance day under the category also holds it.
    await prisma.constructionLabourEmployee.update({
      where: { id: employeeId },
      data: { labourCategoryId: null },
    });
    const dayId = newId();
    await prisma.constructionLabourAttendance.create({
      data: {
        id: dayId,
        workspaceId: owner.workspaceId,
        projectId: newId(),
        employeeId,
        attendanceDate: new Date("2026-10-02"),
        status: "present",
        wageType: "daily",
        wageRate: 80_000,
        earned: 80_000,
        createdBy: "test",
        updatedBy: "test",
        overtime: {
          create: {
            id: newId(),
            labourCategoryId: category.id,
            hours: 1,
            ratePerHour: 10_000,
            amount: 10_000,
          },
        },
      },
    });
    expect((await deleteIt()).status).toBe(StatusCodes.CONFLICT);

    // Once the day is gone (a tombstone), it can be deleted.
    await prisma.constructionLabourAttendance.update({
      where: { id: dayId },
      data: { deletedAt: new Date() },
    });
    expect((await deleteIt()).status).toBe(StatusCodes.NO_CONTENT);
  });

  it("does not show or change another Company's rows", async () => {
    const mine = await ownerWithCompany();
    const theirs = await ownerWithCompany("Sakthi Constructions");
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
  });

  it("checks each list's Menu in the Permission Matrix", async () => {
    const company = await ownerWithCompany();
    const reader = await memberWith(company, {
      "masters.labour_categories": ["read"],
    });
    expect(
      await listOf(listCategories, CATEGORIES, reader.cookie),
    ).toHaveLength(9);
    const refused = await createCategory(
      jsonRequest(CATEGORIES, reader.cookie, { name: "Painter" }),
    );
    expect(refused.status).toBe(StatusCodes.FORBIDDEN);
    expect(await json(refused)).toMatchObject({ code: "PERMISSION_DENIED" });
  });

  it("is on /api/docs", async () => {
    const spec = await json<{
      paths: Record<string, Record<string, { tags: string[] }>>;
      components: { schemas: Record<string, unknown> };
    }>(getOpenApi());
    {
      const path = "/api/construction/masters/labour-categories";
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
      ]),
    );
    // Site Engineers are Employees now (ADR CM-0055 §6).
    for (const gone of ["supervisors", "site-engineers"])
      expect(spec.paths[`/api/construction/masters/${gone}`]).toBeUndefined();
    expect(
      Object.keys(spec.components.schemas).filter((name) =>
        /Supervisor|SiteEngineer/.test(name),
      ),
    ).toEqual([]);
    // The Department master is gone (ADR CM-0048).
    expect(spec.paths["/api/construction/masters/departments"]).toBeUndefined();
    expect(Object.keys(spec.components.schemas)).not.toContain(
      "ConstructionMastersDepartmentResponse",
    );
  });
});
