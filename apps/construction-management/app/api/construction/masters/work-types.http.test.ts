import { prisma } from "@repo/construction-db";
import { StatusCodes } from "http-status-codes";
import { describe, expect, it } from "vitest";

import { GET as getOpenApi } from "@/app/api/openapi.json/route";
import {
  addProject,
  jsonRequest,
  memberWith,
  ownerWithCompany,
} from "@/test/companies";
import { addContractor, addMaterial } from "@/test/procurement";
import { TEST_ORIGIN } from "@/test/sessions";
import {
  sharedAddEquipmentRow,
  sharedAddEquipmentUsageRow,
  sharedAddHindranceRow,
  sharedAddWorksheetRow,
  sharedDeleteDocumentRow,
} from "@/test/site-work";

import { POST as deleteContractor } from "./contractors/[id]/delete/route";
import { POST as deleteDepartment } from "./departments/[id]/delete/route";
import { POST as createDepartment } from "./departments/route";
import { POST as updateCategory } from "./labour-categories/[id]/update/route";
import {
  GET as listCategories,
  POST as createCategory,
} from "./labour-categories/route";
import { POST as deleteMaterial } from "./materials/[id]/delete/route";
import { POST as deleteWorkType } from "./work-types/[id]/delete/route";
import { POST as disableWorkType } from "./work-types/[id]/disable/route";
import { POST as enableWorkType } from "./work-types/[id]/enable/route";
import { GET as getWorkType } from "./work-types/[id]/route";
import { POST as updateWorkType } from "./work-types/[id]/update/route";
import {
  GET as listWorkTypes,
  POST as createWorkType,
} from "./work-types/route";

const BASE = `${TEST_ORIGIN}/api/construction/masters`;
const WORK_TYPES = `${BASE}/work-types`;

type WorkTypeBody = {
  id: string;
  name: string;
  departmentId: string;
  departmentName: string;
  departmentDisabled: boolean;
  materials: {
    id: string;
    name: string;
    unitName: string;
    disabled: boolean;
  }[];
  isSeed: boolean;
  disabled: boolean;
  updatedAt: string;
};

type Category = {
  id: string;
  name: string;
  skill?: string;
  isSeed: boolean;
  updatedAt: string;
};

type Owner = Awaited<ReturnType<typeof ownerWithCompany>>;

function params(id: string) {
  return { params: Promise.resolve({ id }) };
}

async function json<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

async function codeOf(response: Response): Promise<string> {
  return (await json<{ code: string }>(response)).code;
}

async function departmentNamed(workspaceId: string, name: string) {
  const row = await prisma.constructionMastersDepartment.findFirst({
    where: { workspaceId, name, deletedAt: null },
    select: { id: true },
  });
  if (row == null) throw new Error(`No ${name} department`);
  return row.id;
}

async function newDepartment(owner: Owner, name: string): Promise<string> {
  const response = await createDepartment(
    jsonRequest(`${BASE}/departments`, owner.cookie, { name }),
  );
  expect(response.status).toBe(StatusCodes.CREATED);
  return (await json<{ id: string }>(response)).id;
}

async function workTypes(cookie: string, query = "") {
  const response = await listWorkTypes(
    jsonRequest(`${WORK_TYPES}${query}`, cookie),
  );
  expect(response.status).toBe(StatusCodes.OK);
  return json<{ items: WorkTypeBody[]; total: number }>(response);
}

function create(cookie: string, body: unknown) {
  return createWorkType(jsonRequest(WORK_TYPES, cookie, body));
}

function update(cookie: string, id: string, body: unknown) {
  return updateWorkType(
    jsonRequest(`${WORK_TYPES}/${id}/update`, cookie, body),
    params(id),
  );
}

function remove(cookie: string, id: string) {
  return deleteWorkType(
    jsonRequest(`${WORK_TYPES}/${id}/delete`, cookie, {}),
    params(id),
  );
}

describe("Work Types master (CM-601)", () => {
  it("gives a new Company the RCC seed under its RCC Department", async () => {
    const owner = await ownerWithCompany();
    const listed = await workTypes(owner.cookie);
    expect(listed.items).toEqual([
      expect.objectContaining({
        name: "RCC",
        departmentId: await departmentNamed(owner.workspaceId, "RCC"),
        departmentName: "RCC",
        materials: [],
        isSeed: true,
        disabled: false,
      }),
    ]);
  });

  it("adds, reads, changes, disables, enables and deletes a Work Type, with audit", async () => {
    const owner = await ownerWithCompany();
    const rcc = await departmentNamed(owner.workspaceId, "RCC");
    const plumbing = await departmentNamed(owner.workspaceId, "Plumbing");
    const cement = await addMaterial(owner.workspaceId, owner.userId, {
      name: "Cement OPC 53 test",
    });
    const steel = await addMaterial(owner.workspaceId, owner.userId, {
      name: "TMT 12 mm test",
    });

    const created = await create(owner.cookie, {
      name: "  Column   casting ",
      departmentId: rcc,
      materialIds: [steel.id, cement.id, steel.id],
    });
    expect(created.status).toBe(StatusCodes.CREATED);
    const column = await json<WorkTypeBody>(created);
    expect(column).toMatchObject({
      name: "Column casting",
      departmentName: "RCC",
      isSeed: false,
      disabled: false,
      materials: [
        { id: cement.id, name: "Cement OPC 53 test", unitName: "Bag" },
        { id: steel.id, name: "TMT 12 mm test", unitName: "Bag" },
      ],
    });
    const read = await getWorkType(
      jsonRequest(`${WORK_TYPES}/${column.id}`, owner.cookie),
      params(column.id),
    );
    expect(await json(read)).toEqual(column);

    const changed = await update(owner.cookie, column.id, {
      name: "Pipe laying",
      departmentId: plumbing,
      materialIds: [cement.id],
      expectedUpdatedAt: column.updatedAt,
    });
    expect(changed.status).toBe(StatusCodes.OK);
    const pipe = await json<WorkTypeBody>(changed);
    expect(pipe).toMatchObject({
      name: "Pipe laying",
      departmentName: "Plumbing",
      materials: [{ id: cement.id }],
    });
    const stale = await update(owner.cookie, column.id, {
      name: "Again",
      departmentId: plumbing,
      expectedUpdatedAt: column.updatedAt,
    });
    expect(stale.status).toBe(StatusCodes.CONFLICT);
    expect(await codeOf(stale)).toBe("WORK_TYPE_CHANGED");

    const disabled = await disableWorkType(
      jsonRequest(`${WORK_TYPES}/${pipe.id}/disable`, owner.cookie, {}),
      params(pipe.id),
    );
    expect(await json(disabled)).toMatchObject({ disabled: true });
    expect(
      (await workTypes(owner.cookie, "?status=enabled")).items.map(
        (item) => item.name,
      ),
    ).toEqual(["RCC"]);
    const enabled = await enableWorkType(
      jsonRequest(`${WORK_TYPES}/${pipe.id}/enable`, owner.cookie, {}),
      params(pipe.id),
    );
    expect(await json(enabled)).toMatchObject({ disabled: false });

    expect((await remove(owner.cookie, pipe.id)).status).toBe(
      StatusCodes.NO_CONTENT,
    );
    expect((await workTypes(owner.cookie)).items.map((i) => i.name)).toEqual([
      "RCC",
    ]);
    const actions = await prisma.constructionOrganizationAuditEvent.findMany({
      where: { workspaceId: owner.workspaceId, entityId: column.id },
      select: { action: true },
      orderBy: { occurredAt: "asc" },
    });
    expect(actions.map((row) => row.action)).toEqual([
      "work_type.created",
      "work_type.updated",
      "work_type.disabled",
      "work_type.enabled",
      "work_type.deleted",
    ]);
  });

  it("keeps names unique among live Work Types in any case, up to 120 characters", async () => {
    const owner = await ownerWithCompany();
    const rcc = await departmentNamed(owner.workspaceId, "RCC");
    const taken = await create(owner.cookie, {
      name: "rcc",
      departmentId: rcc,
    });
    expect(taken.status).toBe(StatusCodes.CONFLICT);
    expect(await codeOf(taken)).toBe("WORK_TYPE_NAME_IN_USE");
    const long = await create(owner.cookie, {
      name: "x".repeat(121),
      departmentId: rcc,
    });
    expect(long.status).toBe(StatusCodes.BAD_REQUEST);
    expect(await codeOf(long)).toBe("WORK_TYPE_NAME_TOO_LONG");
    expect(
      (
        await create(owner.cookie, {
          name: "x".repeat(120),
          departmentId: rcc,
        })
      ).status,
    ).toBe(StatusCodes.CREATED);

    // A deleted Work Type's name is free again.
    const slab = await json<WorkTypeBody>(
      await create(owner.cookie, { name: "Slab", departmentId: rcc }),
    );
    await remove(owner.cookie, slab.id);
    expect(
      (await create(owner.cookie, { name: "SLAB", departmentId: rcc })).status,
    ).toBe(StatusCodes.CREATED);
  });

  it("keeps the seed's name and Department, but lets it be disabled and take Materials", async () => {
    const owner = await ownerWithCompany();
    const [seed] = (await workTypes(owner.cookie)).items;
    if (seed == null) throw new Error("No seed");
    const cement = await addMaterial(owner.workspaceId, owner.userId);
    const renamed = await update(owner.cookie, seed.id, {
      name: "Concrete",
      departmentId: seed.departmentId,
      expectedUpdatedAt: seed.updatedAt,
    });
    expect(renamed.status).toBe(StatusCodes.CONFLICT);
    expect(await codeOf(renamed)).toBe("SEED_IS_READ_ONLY");
    const deleted = await remove(owner.cookie, seed.id);
    expect(await codeOf(deleted)).toBe("SEED_IS_READ_ONLY");

    const given = await update(owner.cookie, seed.id, {
      name: "RCC",
      departmentId: seed.departmentId,
      materialIds: [cement.id],
      expectedUpdatedAt: seed.updatedAt,
    });
    expect(given.status).toBe(StatusCodes.OK);
    expect(await json(given)).toMatchObject({
      isSeed: true,
      materials: [{ id: cement.id }],
    });
    const disabled = await disableWorkType(
      jsonRequest(`${WORK_TYPES}/${seed.id}/disable`, owner.cookie, {}),
      params(seed.id),
    );
    expect(await json(disabled)).toMatchObject({
      isSeed: true,
      disabled: true,
    });
  });

  it("checks the Department and the assigned Materials", async () => {
    const owner = await ownerWithCompany();
    const rcc = await departmentNamed(owner.workspaceId, "RCC");
    const cement = await addMaterial(owner.workspaceId, owner.userId);
    const old = await addMaterial(owner.workspaceId, owner.userId);
    const other = await ownerWithCompany("Other Builders");
    const foreign = await addMaterial(other.workspaceId, other.userId);

    const noDepartment = await create(owner.cookie, {
      name: "Shuttering",
      departmentId: await departmentNamed(other.workspaceId, "RCC"),
    });
    expect(noDepartment.status).toBe(StatusCodes.BAD_REQUEST);
    expect(await json(noDepartment)).toMatchObject({
      code: "DEPARTMENT_NOT_FOUND",
      details: { field: "departmentId" },
    });
    const noMaterial = await create(owner.cookie, {
      name: "Shuttering",
      departmentId: rcc,
      materialIds: [cement.id, foreign.id],
    });
    expect(noMaterial.status).toBe(StatusCodes.BAD_REQUEST);
    expect(await json(noMaterial)).toMatchObject({
      code: "MATERIAL_NOT_FOUND",
      details: { field: "materialIds", ids: [foreign.id] },
    });

    const made = await json<WorkTypeBody>(
      await create(owner.cookie, {
        name: "Shuttering",
        departmentId: rcc,
        materialIds: [old.id],
      }),
    );
    await prisma.constructionMastersMaterial.update({
      where: { id: old.id },
      data: { disabledAt: new Date() },
    });
    await prisma.constructionMastersMaterial.update({
      where: { id: cement.id },
      data: { disabledAt: new Date() },
    });
    // A disabled Material already assigned stays; a new one is refused.
    const kept = await update(owner.cookie, made.id, {
      name: "Shuttering",
      departmentId: rcc,
      materialIds: [old.id],
      expectedUpdatedAt: made.updatedAt,
    });
    expect(kept.status).toBe(StatusCodes.OK);
    const keptBody = await json<WorkTypeBody>(kept);
    expect(keptBody.materials).toMatchObject([{ id: old.id, disabled: true }]);
    const refused = await update(owner.cookie, made.id, {
      name: "Shuttering",
      departmentId: rcc,
      materialIds: [old.id, cement.id],
      expectedUpdatedAt: keptBody.updatedAt,
    });
    expect(refused.status).toBe(StatusCodes.BAD_REQUEST);
    expect(await codeOf(refused)).toBe("MATERIAL_DISABLED");

    // A deleted Material leaves the list; deleting it is not refused.
    expect(
      (
        await deleteMaterial(
          jsonRequest(`${BASE}/materials/${old.id}/delete`, owner.cookie, {}),
          params(old.id),
        )
      ).status,
    ).toBe(StatusCodes.NO_CONTENT);
    const after = await getWorkType(
      jsonRequest(`${WORK_TYPES}/${made.id}`, owner.cookie),
      params(made.id),
    );
    expect((await json<WorkTypeBody>(after)).materials).toEqual([]);
  });

  it("refuses to delete a Work Type a live worksheet names", async () => {
    const owner = await ownerWithCompany();
    const projectId = await addProject(owner.workspaceId, owner.userId);
    const rcc = await departmentNamed(owner.workspaceId, "RCC");
    const made = await json<WorkTypeBody>(
      await create(owner.cookie, { name: "Footing", departmentId: rcc }),
    );
    const sheet = await sharedAddWorksheetRow(
      owner.workspaceId,
      owner.userId,
      projectId,
      { departmentId: rcc, workTypeId: made.id },
    );
    const used = await remove(owner.cookie, made.id);
    expect(used.status).toBe(StatusCodes.CONFLICT);
    expect(await codeOf(used)).toBe("WORK_TYPE_IN_USE");
    await sharedDeleteDocumentRow("worksheet", sheet.id);
    expect((await remove(owner.cookie, made.id)).status).toBe(
      StatusCodes.NO_CONTENT,
    );
  });

  it("needs the Work Type menu", async () => {
    const owner = await ownerWithCompany();
    const reader = await memberWith(owner, { "masters.work_types": ["read"] });
    expect((await workTypes(reader.cookie)).total).toBe(1);
    const refused = await create(reader.cookie, {
      name: "Footing",
      departmentId: await departmentNamed(owner.workspaceId, "RCC"),
    });
    expect(refused.status).toBe(StatusCodes.FORBIDDEN);
    const outsider = await memberWith(owner, {});
    expect(
      (await listWorkTypes(jsonRequest(WORK_TYPES, outsider.cookie))).status,
    ).toBe(StatusCodes.FORBIDDEN);
  });
});

describe("Labour Category skill (CM-601)", () => {
  it("adds a category with a skill and changes a seed category's skill, not its name", async () => {
    const owner = await ownerWithCompany();
    const created = await createCategory(
      jsonRequest(`${BASE}/labour-categories`, owner.cookie, {
        name: "Coolie",
        skill: "unskilled",
      }),
    );
    expect(await json(created)).toMatchObject({
      name: "Coolie",
      skill: "unskilled",
    });
    const plain = await createCategory(
      jsonRequest(`${BASE}/labour-categories`, owner.cookie, {
        name: "Tiler",
      }),
    );
    expect(await json(plain)).toMatchObject({ skill: "skilled" });

    const listed = await json<{ items: Category[] }>(
      await listCategories(
        jsonRequest(`${BASE}/labour-categories`, owner.cookie),
      ),
    );
    const mason = listed.items.find((item) => item.name === "Mason");
    if (mason == null) throw new Error("No Mason seed");
    expect(mason).toMatchObject({ isSeed: true, skill: "skilled" });
    const reskilled = await updateCategory(
      jsonRequest(
        `${BASE}/labour-categories/${mason.id}/update`,
        owner.cookie,
        {
          name: "Mason",
          skill: "unskilled",
          expectedUpdatedAt: mason.updatedAt,
        },
      ),
      params(mason.id),
    );
    expect(reskilled.status).toBe(StatusCodes.OK);
    const after = await json<Category>(reskilled);
    expect(after).toMatchObject({ name: "Mason", skill: "unskilled" });
    const renamed = await updateCategory(
      jsonRequest(
        `${BASE}/labour-categories/${mason.id}/update`,
        owner.cookie,
        { name: "Bricklayer", expectedUpdatedAt: after.updatedAt },
      ),
      params(mason.id),
    );
    expect(await codeOf(renamed)).toBe("SEED_IS_READ_ONLY");
    const audit = await prisma.constructionOrganizationAuditEvent.findFirst({
      where: { entityId: mason.id, action: "labour_category.updated" },
    });
    expect(audit?.before).toMatchObject({ skill: "skilled" });
    expect(audit?.after).toMatchObject({ skill: "unskilled" });
  });
});

describe("Site work blocks master deletes (CM-601)", () => {
  it("refuses to delete a Department a Work Type, worksheet or usage sheet uses", async () => {
    const owner = await ownerWithCompany();
    const projectId = await addProject(owner.workspaceId, owner.userId);
    const del = (id: string) =>
      deleteDepartment(
        jsonRequest(`${BASE}/departments/${id}/delete`, owner.cookie, {}),
        params(id),
      );

    const byWorkType = await newDepartment(owner, "Fencing");
    await create(owner.cookie, {
      name: "Chain link",
      departmentId: byWorkType,
    });
    const refused = await del(byWorkType);
    expect(refused.status).toBe(StatusCodes.CONFLICT);
    expect(await codeOf(refused)).toBe("DEPARTMENT_IN_USE");

    const byWorksheet = await newDepartment(owner, "Gardening");
    const sheet = await sharedAddWorksheetRow(
      owner.workspaceId,
      owner.userId,
      projectId,
      { departmentId: byWorksheet },
    );
    expect(await codeOf(await del(byWorksheet))).toBe("DEPARTMENT_IN_USE");
    await sharedDeleteDocumentRow("worksheet", sheet.id);
    expect((await del(byWorksheet)).status).toBe(StatusCodes.NO_CONTENT);

    const byUsage = await newDepartment(owner, "Earthwork");
    await sharedAddEquipmentUsageRow(
      owner.workspaceId,
      owner.userId,
      projectId,
      {
        departmentId: byUsage,
      },
    );
    expect(await codeOf(await del(byUsage))).toBe("DEPARTMENT_IN_USE");
  });

  it("refuses to delete a Contractor a worksheet, usage sheet, hindrance or rented equipment names", async () => {
    const owner = await ownerWithCompany();
    const projectId = await addProject(owner.workspaceId, owner.userId);
    const del = (id: string) =>
      deleteContractor(
        jsonRequest(`${BASE}/contractors/${id}/delete`, owner.cookie, {}),
        params(id),
      );
    const add = () => addContractor(owner.workspaceId, owner.userId);
    const uses: ((id: string) => Promise<unknown>)[] = [
      (id) =>
        sharedAddWorksheetRow(owner.workspaceId, owner.userId, projectId, {
          contractorId: id,
        }),
      (id) =>
        sharedAddEquipmentUsageRow(owner.workspaceId, owner.userId, projectId, {
          contractorId: id,
        }),
      (id) =>
        sharedAddHindranceRow(owner.workspaceId, owner.userId, projectId, {
          contractorId: id,
        }),
      (id) =>
        sharedAddEquipmentRow(owner.workspaceId, owner.userId, projectId, id),
    ];
    for (const use of uses) {
      const contractor = await add();
      await use(contractor);
      const refused = await del(contractor);
      expect(refused.status).toBe(StatusCodes.CONFLICT);
      expect(await codeOf(refused)).toBe("CONTRACTOR_IN_USE");
    }
    expect((await del(await add())).status).toBe(StatusCodes.NO_CONTENT);
  });

  it("refuses to delete a Material on a live worksheet or usage sheet line", async () => {
    const owner = await ownerWithCompany();
    const projectId = await addProject(owner.workspaceId, owner.userId);
    const del = (id: string) =>
      deleteMaterial(
        jsonRequest(`${BASE}/materials/${id}/delete`, owner.cookie, {}),
        params(id),
      );
    const onWorksheet = await addMaterial(owner.workspaceId, owner.userId);
    const sheet = await sharedAddWorksheetRow(
      owner.workspaceId,
      owner.userId,
      projectId,
      { materialIds: [onWorksheet.id] },
    );
    const refused = await del(onWorksheet.id);
    expect(refused.status).toBe(StatusCodes.CONFLICT);
    expect(await codeOf(refused)).toBe("MATERIAL_IN_USE");
    await sharedDeleteDocumentRow("worksheet", sheet.id);
    expect((await del(onWorksheet.id)).status).toBe(StatusCodes.NO_CONTENT);

    const onUsage = await addMaterial(owner.workspaceId, owner.userId);
    await sharedAddEquipmentUsageRow(
      owner.workspaceId,
      owner.userId,
      projectId,
      {
        materialIds: [onUsage.id],
      },
    );
    expect(await codeOf(await del(onUsage.id))).toBe("MATERIAL_IN_USE");
  });
});

describe("Work Types on /api/docs", () => {
  it("is on /api/docs", async () => {
    const document = (await getOpenApi().json()) as {
      paths: Record<string, Record<string, unknown>>;
      components: { schemas: Record<string, unknown> };
    };
    const base = "/api/construction/masters/work-types";
    expect(Object.keys(document.paths[base] ?? {})).toEqual(["get", "post"]);
    for (const verb of ["update", "disable", "enable", "delete"])
      expect(document.paths[`${base}/{id}/${verb}`], verb).toBeDefined();
    expect(
      document.components.schemas["ConstructionMastersWorkTypeResponse"],
    ).toBeDefined();
  });
});
