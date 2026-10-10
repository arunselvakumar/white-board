import ExcelJS from "exceljs";
import { prisma } from "@repo/construction-db";
import { StatusCodes } from "http-status-codes";
import { describe, expect, it } from "vitest";

import { GET as getOpenApi } from "@/app/api/openapi.json/route";
import type { PermissionGrants } from "@/src/shared-kernel/access";
import { addDays, todayIn } from "@/src/shared-kernel/calendar-date";
import { newId } from "@/src/shared-kernel/ids";
import {
  addProject,
  jsonRequest,
  memberWith,
  ownerWithCompany,
} from "@/test/companies";
import { addMaterial, addOpeningStock, addStore, addUnit } from "@/test/procurement";
import { TEST_ORIGIN } from "@/test/sessions";

import { POST as adjust } from "./adjustments/route";
import { GET as exportList } from "./export/route";
import { GET as history } from "./history/route";
import { POST as importStock } from "./import/route";
import { POST as deleteMovement } from "./movements/[id]/delete/route";
import { POST as editMovement } from "./movements/[id]/update/route";
import { POST as recordMovements } from "./movements/route";
import { GET as registerExport } from "./register/export/route";
import { GET as register } from "./register/route";
import { GET as list } from "./route";
import { GET as sample } from "./sample/route";
import { POST as settings } from "./settings/route";

const BASE = `${TEST_ORIGIN}/api/construction/procurement/inventory`;
const TODAY = todayIn("Asia/Kolkata");
const XLSX =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

type Company = Awaited<ReturnType<typeof ownerWithCompany>>;
type Row = {
  materialId: string;
  materialName: string;
  inStock: string;
  inTransitIn: string;
  inTransitOut: string;
  estimatedQty: string | null;
  minimum: string | null;
  minimumOverride: string | null;
  alertEnabled: boolean;
  state: string;
};
type List = {
  location: { name: string };
  items: Row[];
  summary: Record<string, number>;
};
type Entry = {
  id: string;
  type: string;
  quantity: string;
  balance: string;
  entryDate: string;
  remark: string | null;
  reversed: boolean;
  reversesEntryId: string | null;
  createdBy: { name: string | null };
  source: { type: string; number: string | null; href: string | null };
  movement: { id: string; kind: string; editable: boolean; updatedAt: string } | null;
};

async function json<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

async function codeOf(response: Response): Promise<string> {
  return (await json<{ code: string }>(response)).code;
}

function at(kind: "project" | "store", id: string) {
  return `locationKind=${kind}&locationId=${id}`;
}

async function setup() {
  const owner = await ownerWithCompany();
  const projectId = await addProject(owner.workspaceId, owner.userId, "Tower A");
  const bag = await addUnit(owner.workspaceId, owner.userId, "Bag");
  const cement = await addMaterial(owner.workspaceId, owner.userId, {
    name: "Cement OPC 53",
    uomId: bag,
    minStockQty: "20",
  });
  const sand = await addMaterial(owner.workspaceId, owner.userId, {
    name: "M Sand",
    uomId: await addUnit(owner.workspaceId, owner.userId, "cum"),
  });
  const site = { kind: "project" as const, id: projectId };
  return { owner, projectId, cement, sand, site };
}

async function stockList(company: { cookie: string }, query: string): Promise<List> {
  const response = await list(jsonRequest(`${BASE}?${query}`, company.cookie));
  expect(response.status).toBe(StatusCodes.OK);
  return json<List>(response);
}

function consume(
  cookie: string,
  location: { kind: "project" | "store"; id: string },
  lines: { date: string; materialId: string; quantity: string; remark?: string }[],
  kind: "consumed" | "missing" = "consumed",
) {
  return recordMovements(
    jsonRequest(`${BASE}/movements`, cookie, { location, kind, lines }),
  );
}

async function historyOf(
  company: Company,
  location: { kind: "project" | "store"; id: string },
  materialId: string,
): Promise<{ items: Entry[]; total: number }> {
  const response = await history(
    jsonRequest(
      `${BASE}/history?${at(location.kind, location.id)}&materialId=${materialId}`,
      company.cookie,
    ),
  );
  expect(response.status).toBe(StatusCodes.OK);
  return json(response);
}

async function memberOn(
  owner: Company,
  projectId: string,
  grants: PermissionGrants,
) {
  const member = await memberWith(owner, grants);
  await prisma.constructionOrganizationTeamMemberProject.create({
    data: { memberId: member.memberId, projectId },
  });
  return member;
}

async function sheet(rows: (string | number | null)[][]): Promise<Uint8Array> {
  const workbook = new ExcelJS.Workbook();
  const ws = workbook.addWorksheet("Inventory");
  ws.addRow(["Material", "Quantity", "Unit", "Estimated Qty"]);
  for (const row of rows) ws.addRow(row);
  return new Uint8Array(
    (await workbook.xlsx.writeBuffer()) as unknown as ArrayBuffer,
  );
}

function upload(url: string, cookie: string, bytes: Uint8Array): Request {
  return new Request(url, {
    method: "POST",
    headers: { "content-type": XLSX, cookie },
    body: Buffer.from(bytes),
  });
}

describe("Current Inventory (CM-506)", () => {
  it("lists stock per material with its state, estimate and minimum", async () => {
    const { owner, cement, sand, site, projectId } = await setup();
    await addOpeningStock(owner.workspaceId, owner.userId, site, cement.id, "100", addDays(TODAY, -10));
    await addOpeningStock(owner.workspaceId, owner.userId, site, sand.id, "5", addDays(TODAY, -10));
    expect(
      (await consume(owner.cookie, site, [
        { date: addDays(TODAY, -1), materialId: cement.id, quantity: "85" },
        { date: TODAY, materialId: sand.id, quantity: "5", remark: "Plastering" },
      ])).status,
    ).toBe(StatusCodes.CREATED);

    const before = await stockList(owner, at("project", projectId));
    expect(before.location.name).toBe("Tower A");
    expect(before.items.map((row) => [row.materialName, row.inStock, row.minimum, row.state])).toEqual([
      ["Cement OPC 53", "15.000", "20.000", "low_stock"],
      ["M Sand", "0.000", null, "out_of_stock"],
    ]);
    expect(before.summary).toEqual({ materials: 2, inStock: 0, lowStock: 1, outOfStock: 1 });

    // Override the minimum here and set the estimate.
    const changed = await settings(
      jsonRequest(`${BASE}/settings`, owner.cookie, {
        location: site,
        materialId: cement.id,
        estimatedQty: "500",
        minStockQty: "10",
      }),
    );
    expect(changed.status).toBe(StatusCodes.OK);
    expect(await json<Row>(changed)).toMatchObject({
      estimatedQty: "500.000",
      minimum: "10.000",
      minimumOverride: "10.000",
      state: "in_stock",
    });

    const filtered = await stockList(owner, `${at("project", projectId)}&state=out_of_stock`);
    expect(filtered.items.map((row) => row.materialName)).toEqual(["M Sand"]);
    const searched = await stockList(owner, `${at("project", projectId)}&search=cem`);
    expect(searched.items.map((row) => row.materialName)).toEqual(["Cement OPC 53"]);

    const exported = await exportList(jsonRequest(`${BASE}/export?${at("project", projectId)}`, owner.cookie));
    expect(exported.status).toBe(StatusCodes.OK);
    expect(exported.headers.get("content-type")).toBe(XLSX);
  });

  it("refuses consumption that would take stock below zero on a later date", async () => {
    const { owner, cement, site } = await setup();
    await addOpeningStock(owner.workspaceId, owner.userId, site, cement.id, "100", addDays(TODAY, -10));
    expect((await consume(owner.cookie, site, [{ date: addDays(TODAY, -2), materialId: cement.id, quantity: "80" }])).status).toBe(StatusCodes.CREATED);
    // 30 five days ago leaves 70 then, but −10 two days ago.
    const refused = await consume(owner.cookie, site, [{ date: addDays(TODAY, -5), materialId: cement.id, quantity: "30" }]);
    expect(refused.status).toBe(StatusCodes.CONFLICT);
    const body = await json<{ code: string; message: string; details: { shortfalls: { materialName: string; shortBy: string; onDate: string }[] } }>(refused);
    expect(body.code).toBe("STOCK_INSUFFICIENT");
    expect(body.message).toContain("Cement OPC 53");
    expect(body.details.shortfalls).toEqual([
      expect.objectContaining({ materialName: "Cement OPC 53", shortBy: "10.000", onDate: addDays(TODAY, -2) }),
    ]);
    // Nothing of a refused batch is kept.
    expect((await historyOf(owner, site, cement.id)).total).toBe(2);

    const future = await consume(owner.cookie, site, [{ date: addDays(TODAY, 1), materialId: cement.id, quantity: "1" }]);
    expect(await codeOf(future)).toBe("STOCK_MOVEMENT_DATE_IN_FUTURE");
    const unknown = await consume(owner.cookie, site, [{ date: TODAY, materialId: newId(), quantity: "1" }]);
    expect(unknown.status).toBe(StatusCodes.BAD_REQUEST);
    expect(await codeOf(unknown)).toBe("MATERIAL_NOT_FOUND");
  });

  it("edits and deletes an entry through reversals the history shows", async () => {
    const { owner, cement, site } = await setup();
    await addOpeningStock(owner.workspaceId, owner.userId, site, cement.id, "50", addDays(TODAY, -10));
    const missing = await consume(owner.cookie, site, [{ date: addDays(TODAY, -3), materialId: cement.id, quantity: "5" }], "missing");
    const [movement] = (await json<{ items: { id: string; updatedAt: string }[] }>(missing)).items;
    if (movement == null) throw new Error("no movement");

    const edited = await editMovement(
      jsonRequest(`${BASE}/movements/${movement.id}/update`, owner.cookie, {
        date: addDays(TODAY, -3),
        quantity: "7",
        remark: "Two more bags torn",
        expectedUpdatedAt: movement.updatedAt,
      }),
      { params: Promise.resolve({ id: movement.id }) },
    );
    expect(edited.status).toBe(StatusCodes.OK);
    const after = await json<{ updatedAt: string; quantity: string }>(edited);
    expect(after.quantity).toBe("7.000");

    // A stale edit is refused.
    const stale = await editMovement(
      jsonRequest(`${BASE}/movements/${movement.id}/update`, owner.cookie, {
        date: addDays(TODAY, -3),
        quantity: "6",
        expectedUpdatedAt: movement.updatedAt,
      }),
      { params: Promise.resolve({ id: movement.id }) },
    );
    expect(await codeOf(stale)).toBe("STOCK_MOVEMENT_CHANGED");

    const { items } = await historyOf(owner, site, cement.id);
    expect(items.map((entry) => [entry.type, entry.quantity, entry.balance, entry.reversed, entry.reversesEntryId != null])).toEqual([
      ["missing", "-7.000", "43.000", false, false],
      ["missing", "5.000", "50.000", false, true],
      ["missing", "-5.000", "45.000", true, false],
      ["opening", "50.000", "50.000", false, false],
    ]);
    expect(items[0]?.movement).toMatchObject({ id: movement.id, kind: "missing", editable: true });
    expect(items[1]?.movement).toBeNull();
    expect(items[0]?.createdBy.name).not.toBeNull();

    const removed = await deleteMovement(
      jsonRequest(`${BASE}/movements/${movement.id}/delete`, owner.cookie, { expectedUpdatedAt: after.updatedAt }),
      { params: Promise.resolve({ id: movement.id }) },
    );
    expect(removed.status).toBe(StatusCodes.NO_CONTENT);
    const final = await historyOf(owner, site, cement.id);
    expect(final.total).toBe(5);
    expect(final.items[0]).toMatchObject({ type: "missing", quantity: "7.000", balance: "50.000" });
    const gone = await deleteMovement(
      jsonRequest(`${BASE}/movements/${movement.id}/delete`, owner.cookie, { expectedUpdatedAt: after.updatedAt }),
      { params: Promise.resolve({ id: movement.id }) },
    );
    expect(gone.status).toBe(StatusCodes.NOT_FOUND);
  });

  it("refuses an edit or delete that later stock depends on", async () => {
    const { owner, cement, site } = await setup();
    const opening = await consume(owner.cookie, site, [], "consumed");
    expect(opening.status).toBe(StatusCodes.BAD_REQUEST);
    await addOpeningStock(owner.workspaceId, owner.userId, site, cement.id, "10", addDays(TODAY, -10));
    const [entry] = (await historyOf(owner, site, cement.id)).items;
    expect((await consume(owner.cookie, site, [{ date: TODAY, materialId: cement.id, quantity: "8" }])).status).toBe(StatusCodes.CREATED);
    const movement = entry?.movement;
    if (movement == null) throw new Error("no opening movement");
    const lowered = await editMovement(
      jsonRequest(`${BASE}/movements/${movement.id}/update`, owner.cookie, {
        date: addDays(TODAY, -10),
        quantity: "5",
        expectedUpdatedAt: movement.updatedAt,
      }),
      { params: Promise.resolve({ id: movement.id }) },
    );
    expect(lowered.status).toBe(StatusCodes.CONFLICT);
    expect(await codeOf(lowered)).toBe("STOCK_INSUFFICIENT");
    const removed = await deleteMovement(
      jsonRequest(`${BASE}/movements/${movement.id}/delete`, owner.cookie, { expectedUpdatedAt: movement.updatedAt }),
      { params: Promise.resolve({ id: movement.id }) },
    );
    expect(await codeOf(removed)).toBe("STOCK_INSUFFICIENT");
  });

  it("adjusts to a counted quantity and refuses no change", async () => {
    const { owner, cement, site, projectId } = await setup();
    await addOpeningStock(owner.workspaceId, owner.userId, site, cement.id, "100", addDays(TODAY, -10));
    const adjusted = await adjust(
      jsonRequest(`${BASE}/adjustments`, owner.cookie, {
        location: site,
        materialId: cement.id,
        date: addDays(TODAY, -1),
        countedQty: "95",
        reason: "Physical count",
      }),
    );
    expect(adjusted.status).toBe(StatusCodes.CREATED);
    expect(await json<{ kind: string; quantity: string }>(adjusted)).toMatchObject({ kind: "adjustment", quantity: "-5.000" });
    const same = await adjust(
      jsonRequest(`${BASE}/adjustments`, owner.cookie, {
        location: site, materialId: cement.id, date: TODAY, countedQty: "95", reason: "Again",
      }),
    );
    expect(await codeOf(same)).toBe("ADJUSTMENT_NO_CHANGE");
    const noReason = await adjust(
      jsonRequest(`${BASE}/adjustments`, owner.cookie, {
        location: site, materialId: cement.id, date: TODAY, countedQty: "90", reason: " ",
      }),
    );
    expect(await codeOf(noReason)).toBe("ADJUSTMENT_REASON_REQUIRED");
    expect((await stockList(owner, at("project", projectId))).items[0]?.inStock).toBe("95.000");
    const [entry] = (await historyOf(owner, site, cement.id)).items;
    expect(entry?.movement).toMatchObject({ kind: "adjustment", editable: false });
    if (entry?.movement == null) throw new Error("no adjustment");
    const edit = await editMovement(
      jsonRequest(`${BASE}/movements/${entry.movement.id}/update`, owner.cookie, {
        date: TODAY, quantity: "1", expectedUpdatedAt: entry.movement.updatedAt,
      }),
      { params: Promise.resolve({ id: entry.movement.id }) },
    );
    expect(await codeOf(edit)).toBe("STOCK_MOVEMENT_NOT_EDITABLE");
  });

  it("flags crossing the minimum with the alert on, and clears it above", async () => {
    const { owner, cement, site } = await setup();
    await addOpeningStock(owner.workspaceId, owner.userId, site, cement.id, "30", addDays(TODAY, -10));
    await settings(jsonRequest(`${BASE}/settings`, owner.cookie, { location: site, materialId: cement.id, minAlertEnabled: true }));
    const flag = async () =>
      (await prisma.constructionProcurementStockSetting.findFirstOrThrow({
        where: { workspaceId: owner.workspaceId, materialId: cement.id },
      })).belowMinimum;
    expect(await flag()).toBe(false);
    await consume(owner.cookie, site, [{ date: TODAY, materialId: cement.id, quantity: "10" }]);
    expect(await flag()).toBe(true); // 20 ≤ the Material's 20
    await adjust(jsonRequest(`${BASE}/adjustments`, owner.cookie, { location: site, materialId: cement.id, date: TODAY, countedQty: "40", reason: "Count" }));
    expect(await flag()).toBe(false);
    // Raising the minimum above the stock is a crossing too.
    await settings(jsonRequest(`${BASE}/settings`, owner.cookie, { location: site, materialId: cement.id, minStockQty: "45" }));
    expect(await flag()).toBe(true);
  });

  it("imports opening stock all or nothing, with per-row errors", async () => {
    const { owner, cement, sand, site, projectId } = await setup();
    const sampleFile = await sample(jsonRequest(`${BASE}/sample?${at("project", projectId)}`, owner.cookie));
    expect(sampleFile.headers.get("content-type")).toBe(XLSX);

    const bad = await sheet([
      ["cement opc 53", 120, "Bag", 500],
      ["M Sand", 4, "Bag", null],
      ["Granite", 1, null, null],
    ]);
    const preview = await importStock(upload(`${BASE}/import?${at("project", projectId)}`, owner.cookie, bad));
    expect(preview.status).toBe(StatusCodes.OK);
    const plan = await json<{ errorCount: number; rows: { row: number; errors: { code: string }[] }[] }>(preview);
    expect(plan.errorCount).toBe(2);
    expect(plan.rows.map((row) => [row.row, row.errors.map((error) => error.code)])).toEqual([
      [2, []],
      [3, ["UNIT_MISMATCH"]],
      [4, ["MATERIAL_NOT_FOUND"]],
    ]);
    const refused = await importStock(upload(`${BASE}/import?${at("project", projectId)}&dryRun=false`, owner.cookie, bad));
    expect(refused.status).toBe(StatusCodes.BAD_REQUEST);
    expect(await codeOf(refused)).toBe("IMPORT_HAS_ERRORS");
    expect((await stockList(owner, at("project", projectId))).items).toEqual([]);

    const good = await sheet([
      ["cement opc 53", 120, "Bag", 500],
      ["M Sand", null, null, 30],
    ]);
    const posted = await importStock(upload(`${BASE}/import?${at("project", projectId)}&dryRun=false&openingDate=${addDays(TODAY, -30)}`, owner.cookie, good));
    expect(posted.status).toBe(StatusCodes.CREATED);
    expect(await json<{ imported: number; estimatesSet: number }>(posted)).toMatchObject({ imported: 1, estimatesSet: 2 });
    const rows = (await stockList(owner, at("project", projectId))).items;
    expect(rows.map((row) => [row.materialName, row.inStock, row.estimatedQty])).toEqual([
      ["Cement OPC 53", "120.000", "500.000"],
      ["M Sand", "0.000", "30.000"],
    ]);
    const [opening] = (await historyOf(owner, site, cement.id)).items;
    expect(opening).toMatchObject({ type: "opening", entryDate: addDays(TODAY, -30) });
    expect(sand.id).toBeDefined();

    // Opening stock only for materials with no entries yet.
    const again = await importStock(upload(`${BASE}/import?${at("project", projectId)}`, owner.cookie, await sheet([["Cement OPC 53", 10, null, null]])));
    expect((await json<{ rows: { errors: { code: string }[] }[] }>(again)).rows[0]?.errors.map((error) => error.code)).toEqual(["MATERIAL_HAS_STOCK_MOVEMENTS"]);

    const notExcel = await importStock(upload(`${BASE}/import?${at("project", projectId)}`, owner.cookie, new TextEncoder().encode("Material,Quantity")));
    expect(await codeOf(notExcel)).toBe("IMPORT_FILE_INVALID");
  });

  it("builds the Stock Register for a date range", async () => {
    const { owner, cement, site, projectId } = await setup();
    await addOpeningStock(owner.workspaceId, owner.userId, site, cement.id, "100", addDays(TODAY, -20));
    await consume(owner.cookie, site, [{ date: addDays(TODAY, -15), materialId: cement.id, quantity: "10" }]);
    await consume(owner.cookie, site, [{ date: addDays(TODAY, -5), materialId: cement.id, quantity: "20" }]);
    await consume(owner.cookie, site, [{ date: addDays(TODAY, -4), materialId: cement.id, quantity: "3" }], "missing");
    await adjust(jsonRequest(`${BASE}/adjustments`, owner.cookie, { location: site, materialId: cement.id, date: addDays(TODAY, -3), countedQty: "70", reason: "Count" }));
    const query = `${at("project", projectId)}&from=${addDays(TODAY, -10)}&to=${TODAY}`;
    const response = await register(jsonRequest(`${BASE}/register?${query}`, owner.cookie));
    expect(response.status).toBe(StatusCodes.OK);
    const body = await json<{ items: Record<string, string>[] }>(response);
    expect(body.items).toEqual([
      expect.objectContaining({
        materialName: "Cement OPC 53",
        opening: "90.000",
        received: "0.000",
        consumed: "20.000",
        missing: "3.000",
        adjustment: "3.000",
        closing: "70.000",
      }),
    ]);
    const file = await registerExport(jsonRequest(`${BASE}/register/export?${query}`, owner.cookie));
    expect(file.headers.get("content-type")).toBe(XLSX);
    const backwards = await register(jsonRequest(`${BASE}/register?${at("project", projectId)}&from=${TODAY}&to=${addDays(TODAY, -1)}`, owner.cookie));
    expect(await codeOf(backwards)).toBe("DATE_RANGE_INVALID");
  });

  it("checks Current Inventory on the Project and Central store on a Store", async () => {
    const { owner, cement, site, projectId } = await setup();
    await addOpeningStock(owner.workspaceId, owner.userId, site, cement.id, "10", addDays(TODAY, -2));
    const reader = await memberOn(owner, projectId, { "procurement.current_inventory": ["read"] });
    expect((await list(jsonRequest(`${BASE}?${at("project", projectId)}`, reader.cookie))).status).toBe(StatusCodes.OK);
    const consumed = await consume(reader.cookie, site, [{ date: TODAY, materialId: cement.id, quantity: "1" }]);
    expect(consumed.status).toBe(StatusCodes.FORBIDDEN);
    expect((await register(jsonRequest(`${BASE}/register?${at("project", projectId)}&from=${TODAY}&to=${TODAY}`, reader.cookie))).status).toBe(StatusCodes.FORBIDDEN);

    // Not on the Project.
    const other = await addProject(owner.workspaceId, owner.userId);
    expect((await list(jsonRequest(`${BASE}?${at("project", other)}`, reader.cookie))).status).toBe(StatusCodes.FORBIDDEN);

    // Another Company's Project.
    const stranger = await ownerWithCompany("Other Builders");
    expect((await list(jsonRequest(`${BASE}?${at("project", projectId)}`, stranger.cookie))).status).toBe(StatusCodes.NOT_FOUND);

    // A Store: Central store, not Current Inventory.
    const storeId = await addStore(owner.workspaceId, owner.userId, [projectId]);
    expect((await list(jsonRequest(`${BASE}?${at("store", storeId)}`, reader.cookie))).status).toBe(StatusCodes.FORBIDDEN);
    const keeper = await memberWith(owner, { "procurement.central_store": ["read", "create"] });
    await addOpeningStock(owner.workspaceId, owner.userId, { kind: "store", id: storeId }, cement.id, "40", addDays(TODAY, -2));
    const storeStock = await stockList(keeper, at("store", storeId));
    expect(storeStock.items.map((row) => row.inStock)).toEqual(["40.000"]);
    expect((await consume(keeper.cookie, { kind: "store", id: storeId }, [{ date: TODAY, materialId: cement.id, quantity: "4" }])).status).toBe(StatusCodes.CREATED);
  });

  it("applies the back-dated policy to consumption", async () => {
    const { owner, cement, site, projectId } = await setup();
    await addOpeningStock(owner.workspaceId, owner.userId, site, cement.id, "10", addDays(TODAY, -30));
    const member = await memberOn(owner, projectId, { "procurement.current_inventory": ["read", "create"] });
    await prisma.constructionOrganizationBackdatedEntryPolicy.create({
      data: {
        id: newId(),
        workspaceId: owner.workspaceId,
        createDays: 0,
        createOverrideDesignationIds: [],
        editDays: 0,
        editOverrideDesignationIds: [],
        modules: {
          material_consumed: {
            mode: "custom",
            create: { days: 3, overrideDesignationIds: [] },
            edit: { days: 3, overrideDesignationIds: [] },
          },
        },
        createdBy: owner.userId,
        updatedBy: owner.userId,
      },
    });
    const old = await consume(member.cookie, site, [{ date: addDays(TODAY, -10), materialId: cement.id, quantity: "1" }]);
    expect(old.status).toBe(StatusCodes.FORBIDDEN);
    expect(await codeOf(old)).toBe("BACKDATED_CREATE_BLOCKED");
    expect((await consume(member.cookie, site, [{ date: addDays(TODAY, -1), materialId: cement.id, quantity: "1" }])).status).toBe(StatusCodes.CREATED);
  });

  it("is on /api/docs", async () => {
    const doc = await json<{ paths: Record<string, unknown> }>(await getOpenApi());
    for (const path of ["", "/export", "/sample", "/import", "/history", "/register", "/register/export", "/settings", "/movements", "/adjustments", "/movements/{id}/update", "/movements/{id}/delete"])
      expect(Object.keys(doc.paths)).toContain(`/api/construction/procurement/inventory${path}`);
  });
});
