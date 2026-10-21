import { randomUUID } from "node:crypto";

import { prisma } from "@repo/construction-db";
import { StatusCodes } from "http-status-codes";
import { describe, expect, it, vi } from "vitest";

import { GET as getOpenApi } from "@/app/api/openapi.json/route";
import type { Flag } from "@/src/shared-kernel/access";
import { actAs, addMember, addProject, newCompany } from "@/test/companies";
import { addMaterial, unitNamed } from "@/test/procurement";
import { worksheetLabourCategory } from "@/test/site-work";

import { POST as deleteRoute } from "./[id]/delete/route";
import { GET as getRoute } from "./[id]/route";
import { POST as updateRoute } from "./[id]/update/route";
import { GET as formOptionsRoute } from "./form-options/route";
import type {
  ConstructionContractsItemFormOptionsResponseModel,
  ConstructionContractsItemResponseModel,
  ListConstructionContractsItemMaterialOptionsResponseModel,
  ListConstructionContractsItemSchedulesResponseModel,
  ListConstructionContractsItemsResponseModel,
} from "./item-models";
import { GET as materialOptionsRoute } from "./material-options/route";
import { GET as listRoute, POST as createRoute } from "./route";
import { GET as schedulesRoute } from "./schedules/route";

vi.mock(import("@repo/auth/construction/server"), async (importOriginal) => ({
  ...(await importOriginal()),
  getCompanyAuthFromHeaders: vi.fn(),
}));

const BASE = "http://localhost/api/construction/contracts/items";

type Item = ConstructionContractsItemResponseModel;
type Page = ListConstructionContractsItemsResponseModel;

async function json<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

async function errorOf(
  response: Response,
): Promise<{ code: string; details?: unknown }> {
  return json<{ code: string; details?: unknown }>(response);
}

const request = (url: string, body?: unknown) =>
  new Request(url, {
    method: body === undefined ? "GET" : "POST",
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

const params = (id: string) => ({ params: Promise.resolve({ id }) });
const create = (body: Record<string, unknown>) =>
  createRoute(request(BASE, body));
const list = (query = "") => listRoute(request(`${BASE}${query}`));
const get = (id: string) => getRoute(request(`${BASE}/${id}`), params(id));
const update = (id: string, body: Record<string, unknown>) =>
  updateRoute(request(`${BASE}/${id}/update`, body), params(id));
const remove = (id: string, body: unknown = {}) =>
  deleteRoute(request(`${BASE}/${id}/delete`, body), params(id));

async function addEquipment(workspaceId: string, by: string, name: string) {
  const id = randomUUID();
  await prisma.constructionSiteWorkEquipment.create({
    data: {
      id,
      workspaceId,
      name,
      equipmentNumber: `TN-07-${randomUUID().slice(0, 4)}`,
      ownership: "owned",
      utilisationBasis: "hourly",
      workingTimeMethod: "meter_reading",
      createdBy: by,
      updatedBy: by,
    },
  });
  return id;
}

/** A live BOQ item copied from `itemId` on a new Project. */
async function addBoqItem(
  workspaceId: string,
  by: string,
  itemId: string,
  uomId: string,
) {
  const projectId = await addProject(workspaceId, by);
  const sectionId = randomUUID();
  await prisma.constructionContractsBoqSection.create({
    data: {
      id: sectionId,
      workspaceId,
      projectId,
      title: "Substructure",
      position: 0,
      createdBy: by,
      updatedBy: by,
    },
  });
  const id = randomUUID();
  await prisma.constructionContractsBoqItem.create({
    data: {
      id,
      workspaceId,
      projectId,
      sectionId,
      itemId,
      itemNo: "1.1",
      description: "PCC",
      uomId,
      originalQuantity: "10",
      quantity: "10",
      originalRate: 612345n,
      rate: 612345n,
      position: 0,
      createdBy: by,
      updatedBy: by,
    },
  });
  return id;
}

async function setup() {
  const company = await newCompany();
  const ws = company.workspaceId;
  const by = company.ownerId;
  const owner = { userId: by, workspaceId: ws, role: "owner" as const };
  const cum = await unitNamed(ws, by, "cum");
  const bag = await unitNamed(ws, by, "Bag");
  const hour = await unitNamed(ws, by, "Hour");
  const cement = await addMaterial(ws, by, {
    name: "Ultratech OPC 53 cement",
    uomId: bag,
    unitRate: 41550n,
  });
  const mason = await worksheetLabourCategory(ws, by, "skilled");
  const mixer = await addEquipment(ws, by, "Concrete mixer");
  actAs(owner);
  return { ws, by, owner, cum, bag, hour, cement, mason, mixer };
}

type Ctx = Awaited<ReturnType<typeof setup>>;

function pcc(ctx: Ctx, extra: Record<string, unknown> = {}) {
  return {
    code: " 5.1.1 ",
    shortDescription: "PCC 1:4:8",
    description: "Providing and laying cement concrete 1:4:8",
    uomId: ctx.cum,
    sacHsn: "995411",
    schedule: "CPWD DSR 2023",
    adoptedRate: 6_123_45,
    ...extra,
  };
}

function analysis(ctx: Ctx) {
  return {
    overheadPercent: "15",
    lines: [
      {
        kind: "material",
        materialId: ctx.cement.id,
        coefficient: "0.45",
        rate: 41550,
      },
      {
        kind: "labour",
        labourCategoryId: ctx.mason,
        coefficient: 0.1,
        rate: 95000,
      },
      {
        kind: "equipment",
        equipmentId: ctx.mixer,
        coefficient: "0.5",
        resourceUomId: ctx.hour,
        rate: 50000,
      },
      { kind: "lump_sum", description: "Water", coefficient: 9, rate: 1000 },
    ],
  };
}

async function member(ctx: Ctx, grants: Record<string, readonly Flag[]>) {
  const added = await addMember(ctx.ws, ctx.by, grants);
  actAs({ userId: added.userId, workspaceId: ctx.ws, role: "member" });
  return added;
}

describe("Item Library HTTP (CM-1102, ADR CM-0023 §3)", () => {
  it("adds an Item with its rate analysis, worked out in paise", async () => {
    const ctx = await setup();
    const created = await create({ ...pcc(ctx), ...analysis(ctx) });
    expect(created.status).toBe(StatusCodes.CREATED);
    const item = await json<Item>(created);
    // 18,698 + 9,500 + 25,000 + 1,000 = 54,198; × 1.15 = 62,327.7 → 62,328.
    expect(item).toMatchObject({
      code: "5.1.1",
      shortDescription: "PCC 1:4:8",
      uomId: ctx.cum,
      uomName: "cum",
      sacHsn: "995411",
      schedule: "CPWD DSR 2023",
      adoptedRate: 612345,
      overheadPercent: "15.00",
      analysedRate: 62328,
      lineCount: 4,
    });
    expect(item.lines).toMatchObject([
      {
        position: 0,
        kind: "material",
        materialName: "Ultratech OPC 53 cement",
        coefficient: "0.4500",
        // A material line without a UoM takes the Material's.
        resourceUomId: ctx.bag,
        resourceUomName: "Bag",
        rate: 41550,
        amount: 18698,
      },
      {
        position: 1,
        kind: "labour",
        labourCategoryId: ctx.mason,
        coefficient: "0.1000",
        amount: 9500,
      },
      {
        position: 2,
        kind: "equipment",
        equipmentName: expect.stringMatching(
          /^Concrete mixer \(TN-07-/,
        ) as unknown,
        resourceUomName: "Hour",
        amount: 25000,
      },
      {
        position: 3,
        kind: "lump_sum",
        description: "Water",
        coefficient: "1.0000",
        materialId: null,
        amount: 1000,
      },
    ]);
    expect(await json<Item>(await get(item.id))).toEqual(item);
    const audit = await prisma.constructionOrganizationAuditEvent.findFirst({
      where: { entityId: item.id, action: "item.created" },
    });
    expect(audit?.after).toMatchObject({
      adoptedRate: 612345,
      analysedRate: 62328,
    });

    // Without lines there is no analysed rate.
    const plain = await json<Item>(
      await create(pcc(ctx, { code: "5.1.2", overheadPercent: "10" })),
    );
    expect(plain).toMatchObject({
      analysedRate: null,
      lines: [],
      lineCount: 0,
    });
  });

  it("refuses a bad field, UoM or analysis line with a 400", async () => {
    const ctx = await setup();
    const other = await newCompany();
    const foreignUom = await unitNamed(other.workspaceId, other.ownerId, "cum");
    const disabledUom = await unitNamed(ctx.ws, ctx.by, "Brass");
    await prisma.constructionMastersMeasurementUnit.update({
      where: { id: disabledUom },
      data: { disabledAt: new Date() },
    });
    const foreignMaterial = await addMaterial(other.workspaceId, other.ownerId);
    actAs(ctx.owner);
    const cases: [Record<string, unknown>, string, unknown?][] = [
      [pcc(ctx, { code: " " }), "ITEM_CODE_REQUIRED"],
      [pcc(ctx, { code: "X".repeat(33) }), "ITEM_CODE_TOO_LONG"],
      [pcc(ctx, { shortDescription: "" }), "ITEM_SHORT_DESCRIPTION_REQUIRED"],
      [pcc(ctx, { sacHsn: "99" }), "SAC_HSN_INVALID"],
      [pcc(ctx, { schedule: "S".repeat(81) }), "ITEM_SCHEDULE_TOO_LONG"],
      [pcc(ctx, { adoptedRate: -1 }), "ITEM_RATE_INVALID"],
      [pcc(ctx, { uomId: randomUUID() }), "ITEM_UOM_INVALID"],
      [pcc(ctx, { uomId: foreignUom }), "ITEM_UOM_INVALID"],
      [pcc(ctx, { uomId: disabledUom }), "ITEM_UOM_INVALID"],
      [pcc(ctx, { overheadPercent: "101" }), "OVERHEAD_PERCENT_INVALID"],
      [
        pcc(ctx, {
          lines: [
            { kind: "lump_sum", description: "Water", rate: 100 },
            { kind: "material", coefficient: 1, rate: 1 },
          ],
        }),
        "ANALYSIS_MATERIAL_REQUIRED",
        { line: 1, field: "lines.1.materialId" },
      ],
      [
        pcc(ctx, {
          lines: [
            {
              kind: "material",
              materialId: foreignMaterial.id,
              coefficient: 1,
              rate: 1,
            },
          ],
        }),
        "ANALYSIS_MATERIAL_INVALID",
        { line: 0 },
      ],
      [
        pcc(ctx, {
          lines: [
            {
              kind: "labour",
              labourCategoryId: randomUUID(),
              coefficient: 1,
              rate: 1,
            },
          ],
        }),
        "ANALYSIS_LABOUR_CATEGORY_INVALID",
      ],
      [
        pcc(ctx, {
          lines: [
            {
              kind: "equipment",
              equipmentId: randomUUID(),
              coefficient: 1,
              rate: 1,
            },
          ],
        }),
        "ANALYSIS_EQUIPMENT_INVALID",
      ],
      [
        pcc(ctx, {
          lines: [
            {
              kind: "labour",
              labourCategoryId: ctx.mason,
              coefficient: 1,
              resourceUomId: foreignUom,
              rate: 1,
            },
          ],
        }),
        "ANALYSIS_UOM_INVALID",
      ],
      [
        pcc(ctx, {
          lines: [
            {
              kind: "labour",
              labourCategoryId: ctx.mason,
              coefficient: "0",
              rate: 1,
            },
          ],
        }),
        "ANALYSIS_COEFFICIENT_INVALID",
      ],
      [
        pcc(ctx, { lines: [{ kind: "lump_sum", rate: 100 }] }),
        "ANALYSIS_DESCRIPTION_REQUIRED",
      ],
    ];
    for (const [body, code, details] of cases) {
      const refused = await create(body);
      expect(refused.status, code).toBe(StatusCodes.BAD_REQUEST);
      const error = await errorOf(refused);
      expect(error.code, code).toBe(code);
      if (details != null) expect(error.details, code).toMatchObject(details);
    }
    expect(
      await prisma.constructionContractsItem.count({
        where: { workspaceId: ctx.ws },
      }),
    ).toBe(0);
  });

  it("keeps codes unique among live Items ignoring case", async () => {
    const ctx = await setup();
    const first = await json<Item>(await create(pcc(ctx)));
    const taken = await create(pcc(ctx, { code: "5.1.1" }));
    expect(taken.status).toBe(StatusCodes.CONFLICT);
    expect(await errorOf(taken)).toMatchObject({
      code: "ITEM_CODE_TAKEN",
      details: { field: "code" },
    });
    const own = await json<Item>(await create(pcc(ctx, { code: "own-pl-01" })));
    expect((await create(pcc(ctx, { code: "OWN-PL-01" }))).status).toBe(
      StatusCodes.CONFLICT,
    );
    // Renaming onto another code is refused too.
    const renamed = await update(own.id, {
      ...pcc(ctx, { code: "5.1.1" }),
      expectedUpdatedAt: own.updatedAt,
    });
    expect((await errorOf(renamed)).code).toBe("ITEM_CODE_TAKEN");
    // A deleted Item frees its code.
    expect((await remove(first.id)).status).toBe(StatusCodes.NO_CONTENT);
    expect((await create(pcc(ctx, { code: "5.1.1" }))).status).toBe(
      StatusCodes.CREATED,
    );
    // The same code is free in another Company.
    const other = await newCompany();
    const otherCum = await unitNamed(other.workspaceId, other.ownerId, "cum");
    actAs({
      userId: other.ownerId,
      workspaceId: other.workspaceId,
      role: "owner",
    });
    expect((await create(pcc(ctx, { uomId: otherCum }))).status).toBe(
      StatusCodes.CREATED,
    );
  });

  it("replaces the analysis lines on update and checks expectedUpdatedAt", async () => {
    const ctx = await setup();
    const item = await json<Item>(
      await create({ ...pcc(ctx), ...analysis(ctx) }),
    );
    const updated = await update(item.id, {
      ...pcc(ctx, {
        shortDescription: "PCC 1:4:8 (M7.5)",
        adoptedRate: 650000,
      }),
      overheadPercent: null,
      lines: [
        { kind: "lump_sum", description: "Sub-contract rate", rate: 600000 },
      ],
      expectedUpdatedAt: item.updatedAt,
    });
    expect(updated.status).toBe(StatusCodes.OK);
    const saved = await json<Item>(updated);
    expect(saved).toMatchObject({
      shortDescription: "PCC 1:4:8 (M7.5)",
      adoptedRate: 650000,
      overheadPercent: null,
      analysedRate: 600000,
      lineCount: 1,
    });
    expect(saved.lines).toHaveLength(1);
    expect(
      await prisma.constructionContractsItemAnalysisLine.count({
        where: { itemId: item.id },
      }),
    ).toBe(1);

    // The form loaded before that save is stale.
    const stale = await update(item.id, {
      ...pcc(ctx),
      expectedUpdatedAt: item.updatedAt,
    });
    expect(stale.status).toBe(StatusCodes.CONFLICT);
    expect((await errorOf(stale)).code).toBe("ITEM_CHANGED");
    const staleDelete = await remove(item.id, {
      expectedUpdatedAt: item.updatedAt,
    });
    expect((await errorOf(staleDelete)).code).toBe("ITEM_CHANGED");

    // Clearing the lines clears the analysed rate.
    const cleared = await json<Item>(
      await update(item.id, {
        ...pcc(ctx),
        lines: [],
        expectedUpdatedAt: saved.updatedAt,
      }),
    );
    expect(cleared).toMatchObject({ analysedRate: null, lineCount: 0 });
    const audit = await prisma.constructionOrganizationAuditEvent.count({
      where: { entityId: item.id, action: "item.updated" },
    });
    expect(audit).toBe(2);
  });

  it("keeps a disabled Material or UoM the Item already has", async () => {
    const ctx = await setup();
    const item = await json<Item>(
      await create({ ...pcc(ctx), ...analysis(ctx) }),
    );
    await prisma.constructionMastersMaterial.update({
      where: { id: ctx.cement.id },
      data: { disabledAt: new Date() },
    });
    await prisma.constructionMastersMeasurementUnit.update({
      where: { id: ctx.cum },
      data: { disabledAt: new Date() },
    });
    const kept = await update(item.id, {
      ...pcc(ctx),
      ...analysis(ctx),
      expectedUpdatedAt: item.updatedAt,
    });
    expect(kept.status).toBe(StatusCodes.OK);
    // A new Item cannot pick them.
    const fresh = await create({ ...pcc(ctx, { code: "N-1" }) });
    expect((await errorOf(fresh)).code).toBe("ITEM_UOM_INVALID");
  });

  it("refuses to delete an Item a live BOQ item uses", async () => {
    const ctx = await setup();
    const item = await json<Item>(await create(pcc(ctx)));
    const boqItemId = await addBoqItem(ctx.ws, ctx.by, item.id, ctx.cum);
    await addBoqItem(ctx.ws, ctx.by, item.id, ctx.cum);
    const refused = await remove(item.id, {
      expectedUpdatedAt: item.updatedAt,
    });
    expect(refused.status).toBe(StatusCodes.CONFLICT);
    expect(await errorOf(refused)).toMatchObject({
      code: "ITEM_IN_USE",
      details: { count: 2 },
    });
    await prisma.constructionContractsBoqItem.updateMany({
      where: { itemId: item.id },
      data: { deletedAt: new Date(), deletedBy: ctx.by },
    });
    expect(boqItemId).toBeDefined();
    expect((await remove(item.id)).status).toBe(StatusCodes.NO_CONTENT);
    expect((await get(item.id)).status).toBe(StatusCodes.NOT_FOUND);
    expect(
      await prisma.constructionOrganizationAuditEvent.count({
        where: { entityId: item.id, action: "item.deleted" },
      }),
    ).toBe(1);
  });

  it("lists in code order with search, schedule filter, cursor pages and total", async () => {
    const ctx = await setup();
    for (const [code, schedule, shortDescription] of [
      ["5.1.2", "CPWD DSR 2023", "PCC 1:3:6"],
      ["5.1.1", "CPWD DSR 2023", "PCC 1:4:8"],
      ["13.4.1", "TN PWD SoR 2025-26", "Cement plaster 12 mm"],
      ["OWN-01", null, "Shuttering for slabs"],
    ] as const)
      await create(pcc(ctx, { code, schedule, shortDescription }));

    const all = await json<Page>(await list());
    expect(all.items.map((item) => item.code)).toEqual([
      "13.4.1",
      "5.1.1",
      "5.1.2",
      "OWN-01",
    ]);
    expect(all.total).toBe(4);
    expect(all.viewerFlags).toEqual([
      "create",
      "read",
      "update",
      "delete",
      "export",
      "import",
    ]);

    const first = await json<Page>(await list("?limit=2"));
    expect(first.items.map((item) => item.code)).toEqual(["13.4.1", "5.1.1"]);
    expect(first.prevCursor).toBeNull();
    const second = await json<Page>(
      await list(`?limit=2&after=${first.nextCursor ?? ""}`),
    );
    expect(second.items.map((item) => item.code)).toEqual(["5.1.2", "OWN-01"]);
    expect(second.nextCursor).toBeNull();
    expect(second.total).toBe(4);
    const back = await json<Page>(
      await list(`?limit=2&before=${second.prevCursor ?? ""}`),
    );
    expect(back.items.map((item) => item.code)).toEqual(["13.4.1", "5.1.1"]);

    const searched = await json<Page>(await list("?q=plaster"));
    expect(searched.items.map((item) => item.code)).toEqual(["13.4.1"]);
    expect((await json<Page>(await list("?q=own-0"))).total).toBe(1);
    const filtered = await json<Page>(
      await list(`?schedule=${encodeURIComponent("CPWD DSR 2023")}`),
    );
    expect(filtered.items.map((item) => item.code)).toEqual(["5.1.1", "5.1.2"]);
    expect((await list("?after=nonsense")).status).toBe(
      StatusCodes.BAD_REQUEST,
    );

    const schedules =
      await json<ListConstructionContractsItemSchedulesResponseModel>(
        await schedulesRoute(request(`${BASE}/schedules`)),
      );
    expect(schedules.items).toEqual(["CPWD DSR 2023", "TN PWD SoR 2025-26"]);
  });

  it("offers the form's pickers and suggests a Material's rate with Materials Financial", async () => {
    const ctx = await setup();
    const options =
      await json<ConstructionContractsItemFormOptionsResponseModel>(
        await formOptionsRoute(request(`${BASE}/form-options`)),
      );
    expect(options.uoms.map((uom) => uom.name)).toContain("cum");
    expect(options.labourCategories.map((row) => row.id)).toContain(ctx.mason);
    expect(options.equipment.map((row) => row.id)).toEqual([ctx.mixer]);
    const materials =
      await json<ListConstructionContractsItemMaterialOptionsResponseModel>(
        await materialOptionsRoute(
          request(`${BASE}/material-options?search=ultratech`),
        ),
      );
    expect(materials.items).toEqual([
      expect.objectContaining({
        id: ctx.cement.id,
        uomName: "Bag",
        unitRate: 41550,
      }),
    ]);

    await member(ctx, { "contracts.items": ["read", "create"] });
    const hidden =
      await json<ListConstructionContractsItemMaterialOptionsResponseModel>(
        await materialOptionsRoute(
          request(`${BASE}/material-options?search=ultratech`),
        ),
      );
    expect(hidden.items[0]?.unitRate).toBeNull();
    await member(ctx, {
      "contracts.items": ["update"],
      "masters.materials": ["read", "financial"],
    });
    const shown =
      await json<ListConstructionContractsItemMaterialOptionsResponseModel>(
        await materialOptionsRoute(
          request(`${BASE}/material-options?search=ultratech`),
        ),
      );
    expect(shown.items[0]?.unitRate).toBe(41550);
  });

  it("checks the Item Library flags on every route", async () => {
    const ctx = await setup();
    const item = await json<Item>(await create(pcc(ctx)));

    await member(ctx, {});
    expect((await list()).status).toBe(StatusCodes.FORBIDDEN);
    expect((await get(item.id)).status).toBe(StatusCodes.FORBIDDEN);
    expect((await schedulesRoute(request(`${BASE}/schedules`))).status).toBe(
      StatusCodes.FORBIDDEN,
    );

    await member(ctx, { "contracts.items": ["read"] });
    const page = await json<Page>(await list());
    expect(page.total).toBe(1);
    expect(page.viewerFlags).toEqual(["read"]);
    expect((await get(item.id)).status).toBe(StatusCodes.OK);
    expect((await create(pcc(ctx, { code: "N-2" }))).status).toBe(
      StatusCodes.FORBIDDEN,
    );
    expect(
      (
        await update(item.id, {
          ...pcc(ctx),
          expectedUpdatedAt: item.updatedAt,
        })
      ).status,
    ).toBe(StatusCodes.FORBIDDEN);
    expect((await remove(item.id)).status).toBe(StatusCodes.FORBIDDEN);
    expect(
      (await formOptionsRoute(request(`${BASE}/form-options`))).status,
    ).toBe(StatusCodes.FORBIDDEN);
    expect(
      (await materialOptionsRoute(request(`${BASE}/material-options`))).status,
    ).toBe(StatusCodes.FORBIDDEN);

    await member(ctx, { "contracts.items": ["read", "update"] });
    expect(
      (
        await update(item.id, {
          ...pcc(ctx),
          expectedUpdatedAt: item.updatedAt,
        })
      ).status,
    ).toBe(StatusCodes.OK);
  });

  it("hides another Company's Items behind a 404", async () => {
    const ctx = await setup();
    const item = await json<Item>(await create(pcc(ctx)));
    const other = await newCompany();
    actAs({
      userId: other.ownerId,
      workspaceId: other.workspaceId,
      role: "owner",
    });
    expect((await get(item.id)).status).toBe(StatusCodes.NOT_FOUND);
    expect(
      (
        await update(item.id, {
          ...pcc(ctx),
          expectedUpdatedAt: item.updatedAt,
        })
      ).status,
    ).toBe(StatusCodes.NOT_FOUND);
    expect((await remove(item.id)).status).toBe(StatusCodes.NOT_FOUND);
    expect((await json<Page>(await list())).items).toEqual([]);
  });

  it("is listed in the OpenAPI document", async () => {
    const document = await json<{
      paths: Record<string, unknown>;
      components: { schemas: Record<string, unknown> };
    }>(getOpenApi());
    for (const path of [
      BASE.replace("http://localhost", ""),
      "/api/construction/contracts/items/schedules",
      "/api/construction/contracts/items/form-options",
      "/api/construction/contracts/items/material-options",
      "/api/construction/contracts/items/sample",
      "/api/construction/contracts/items/import",
      "/api/construction/contracts/items/export",
      "/api/construction/contracts/items/{id}",
      "/api/construction/contracts/items/{id}/update",
      "/api/construction/contracts/items/{id}/delete",
    ])
      expect(document.paths[path], path).toBeDefined();
    expect(
      document.components.schemas["ConstructionContractsItemResponse"],
    ).toBeDefined();
  });
});
