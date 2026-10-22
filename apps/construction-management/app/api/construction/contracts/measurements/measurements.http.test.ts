import { prisma } from "@repo/construction-db";
import { StatusCodes } from "http-status-codes";
import { afterEach, describe, expect, it, vi } from "vitest";

import { GET as getOpenApi } from "@/app/api/openapi.json/route";
import type { Flag } from "@/src/shared-kernel/access";
import { addDays, todayIn } from "@/src/shared-kernel/calendar-date";
import { newId } from "@/src/shared-kernel/ids";
import { actAs, addMember, addProject, newCompany } from "@/test/companies";
import { watchEvents } from "@/test/dispatched-events";
import { pngBytes } from "@/test/files";
import { unitNamed } from "@/test/procurement";
import { TEST_ORIGIN } from "@/test/sessions";
import {
  sharedAssign,
  worksheetContractor,
  worksheetLocation,
} from "@/test/site-work";

import type {
  ConstructionContractsBoqItemModel,
  ConstructionContractsBoqSectionResponseModel,
} from "../boq/boq-models";
import { POST as updateBoqItemRoute } from "../boq/items/[id]/update/route";
import { POST as createBoqItemRoute } from "../boq/items/route";
import { POST as createSectionRoute } from "../boq/sections/route";
import { POST as approveWorkOrderRoute } from "../work-orders/[id]/approve/route";
import { POST as submitWorkOrderRoute } from "../work-orders/[id]/submit/route";
import { POST as createWorkOrderRoute } from "../work-orders/route";
import type { GetConstructionContractsWorkOrderResponseModel } from "../work-orders/work-order-models";
import { POST as checkRoute } from "./[id]/check/route";
import { POST as deleteRoute } from "./[id]/delete/route";
import { POST as deletePhotoRoute } from "./[id]/photos/[photoId]/delete/route";
import { GET as photoRoute } from "./[id]/photos/[photoId]/route";
import {
  GET as photosRoute,
  POST as completePhotoRoute,
} from "./[id]/photos/route";
import { POST as receivePhotoRoute } from "./[id]/photos/uploads/app/route";
import { POST as startPhotoRoute } from "./[id]/photos/uploads/route";
import { POST as reopenRoute } from "./[id]/reopen/route";
import { POST as returnRoute } from "./[id]/return/route";
import { GET as getRoute } from "./[id]/route";
import { POST as submitRoute } from "./[id]/submit/route";
import { POST as updateRoute } from "./[id]/update/route";
import { GET as formOptionsRoute } from "./form-options/route";
import type {
  ConstructionContractsMeasurementFormOptionsResponseModel,
  GetConstructionContractsMeasurementResponseModel,
  ListConstructionContractsMeasurementPhotosResponseModel,
  ListConstructionContractsMeasurementQuantitiesResponseModel,
  ListConstructionContractsMeasurementsResponseModel,
} from "./measurement-models";
import { GET as quantitiesRoute } from "./quantities/route";
import { GET as listRoute, POST as createRoute } from "./route";

vi.mock(import("@repo/auth/construction/server"), async (importOriginal) => ({
  ...(await importOriginal()),
  getCompanyAuthFromHeaders: vi.fn(),
}));

afterEach(() => {
  vi.restoreAllMocks();
});

const BASE = "http://localhost/api/construction/contracts/measurements";
const BOQ = "http://localhost/api/construction/contracts/boq";
const WORK_ORDERS = "http://localhost/api/construction/contracts/work-orders";
const TODAY = todayIn("Asia/Kolkata");
const YESTERDAY = addDays(TODAY, -1);

type Sheet = GetConstructionContractsMeasurementResponseModel;
type WorkOrder = GetConstructionContractsWorkOrderResponseModel;

async function json<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

async function errorOf(
  response: Response,
): Promise<{ code: string; details?: Record<string, unknown> }> {
  return json(response);
}

const request = (url: string, body?: unknown) =>
  new Request(url, {
    method: body === undefined ? "GET" : "POST",
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

const params = (id: string) => ({ params: Promise.resolve({ id }) });

const api = {
  create: (body: Record<string, unknown>) => createRoute(request(BASE, body)),
  list: (query: string) => listRoute(request(`${BASE}?${query}`)),
  get: (id: string) => getRoute(request(`${BASE}/${id}`), params(id)),
  update: (id: string, body: Record<string, unknown>) =>
    updateRoute(request(`${BASE}/${id}/update`, body), params(id)),
  remove: (id: string, body: Record<string, unknown> = {}) =>
    deleteRoute(request(`${BASE}/${id}/delete`, body), params(id)),
  submit: (id: string) =>
    submitRoute(request(`${BASE}/${id}/submit`, {}), params(id)),
  check: (id: string, body: Record<string, unknown>) =>
    checkRoute(request(`${BASE}/${id}/check`, body), params(id)),
  returnToDraft: (id: string, reason: string) =>
    returnRoute(request(`${BASE}/${id}/return`, { reason }), params(id)),
  reopen: (id: string, reason: string) =>
    reopenRoute(request(`${BASE}/${id}/reopen`, { reason }), params(id)),
  formOptions: (projectId: string) =>
    formOptionsRoute(request(`${BASE}/form-options?projectId=${projectId}`)),
  quantities: (query: string) =>
    quantitiesRoute(request(`${BASE}/quantities?${query}`)),
};

const JOINT = {
  partyName: "R. Kumar",
  partyRole: "Client's engineer",
  jointOn: TODAY,
};

async function setup() {
  const company = await newCompany();
  const ws = company.workspaceId;
  const by = company.ownerId;
  const owner = { userId: by, workspaceId: ws, role: "owner" as const };
  const projectId = await addProject(ws, by, "Metro Depot");
  await prisma.constructionProjectsProject.update({
    where: { id: projectId },
    data: { role: "contract", clientName: "Chennai Metro Rail" },
  });
  const cum = await unitNamed(ws, by, "cum");
  const contractorId = await worksheetContractor(ws, by, {
    projectIds: [projectId],
    name: "Velan Constructions",
  });
  actAs(owner);
  const section = await json<ConstructionContractsBoqSectionResponseModel>(
    await createSectionRoute(
      request(`${BOQ}/sections`, { projectId, title: "Earthwork" }),
    ),
  );
  const addBoqItem = async (itemNo: string, quantity = "100") => {
    const response = await createBoqItemRoute(
      request(`${BOQ}/items`, {
        projectId,
        sectionId: section.id,
        itemNo,
        description: `Excavation ${itemNo}`,
        uomId: cum,
        quantity,
        rate: 450_00,
      }),
    );
    expect(response.status).toBe(StatusCodes.CREATED);
    return json<ConstructionContractsBoqItemModel>(response);
  };
  const itemA = await addBoqItem("1.1");
  const itemB = await addBoqItem("1.2", "10");
  /** A Work Order on itemA (40 cum) and a non-BOQ line, drafted or issued. */
  const workOrder = async (issue = true) => {
    const created = await createWorkOrderRoute(
      request(WORK_ORDERS, {
        projectId,
        contractorId,
        orderDate: "2026-10-01",
        lines: [
          { kind: "boq", boqItemId: itemA.id, quantity: "40", rate: 400_00 },
          {
            kind: "non_boq",
            itemNo: "NB-1",
            description: "Dewatering",
            uomId: cum,
            quantity: "5",
            rate: 100_00,
          },
        ],
      }),
    );
    expect(created.status).toBe(StatusCodes.CREATED);
    const draft = await json<WorkOrder>(created);
    if (!issue) return draft;
    const woParams = params(draft.id);
    await submitWorkOrderRoute(
      request(`${WORK_ORDERS}/${draft.id}/submit`, {}),
      woParams,
    );
    return json<WorkOrder>(
      await approveWorkOrderRoute(
        request(`${WORK_ORDERS}/${draft.id}/approve`, {}),
        woParams,
      ),
    );
  };
  const created = async (body: Record<string, unknown>) => {
    const response = await api.create({
      projectId,
      side: "client",
      measuredOn: YESTERDAY,
      rows: [],
      ...body,
    });
    expect(response.status, JSON.stringify(await response.clone().json())).toBe(
      StatusCodes.CREATED,
    );
    return json<Sheet>(response);
  };
  const read = async (id: string) => json<Sheet>(await api.get(id));
  /** Drafted, submitted and checked. */
  const checked = async (body: Record<string, unknown>) => {
    const draft = await created(body);
    expect((await api.submit(draft.id)).status).toBe(StatusCodes.OK);
    const response = await api.check(draft.id, JOINT);
    expect(response.status).toBe(StatusCodes.OK);
    return json<Sheet>(response);
  };
  return {
    ws,
    by,
    owner,
    projectId,
    cum,
    contractorId,
    section,
    itemA,
    itemB,
    workOrder,
    created,
    read,
    checked,
  };
}

type Ctx = Awaited<ReturnType<typeof setup>>;

async function member(ctx: Ctx, flags: Flag[], onProject = true) {
  const added = await addMember(ctx.ws, ctx.by, {
    "contracts.measurements": flags,
    "contracts.boq": ["read"],
  });
  if (onProject) await sharedAssign(added.memberId, ctx.projectId);
  return { userId: added.userId, workspaceId: ctx.ws, role: "member" as const };
}

/** The editable fields of a sheet as loaded, to send back on an edit. */
function formOf(sheet: Sheet) {
  return {
    measuredOn: sheet.measuredOn,
    title: sheet.title,
    remarks: sheet.remarks,
    rows: sheet.rows.map((row) => ({
      boqItemId: row.boqItemId,
      workOrderLineId: row.workOrderLineId,
      description: row.description,
      location: row.location,
      nos: row.nos,
      length: row.length,
      breadth: row.breadth,
      depth: row.depth,
      direct: row.direct,
      quantity: row.direct ? row.quantity : null,
    })),
    expectedUpdatedAt: sheet.updatedAt,
  };
}

describe("Measurement Book (CM-1105)", () => {
  it("drafts a client-side sheet that computes its rows, then submits and checks it", async () => {
    const ctx = await setup();
    const locationId = await worksheetLocation(ctx.ws, ctx.by, ctx.projectId);
    const events = watchEvents();
    const draft = await ctx.created({
      title: "Footings F1–F4",
      rows: [
        {
          boqItemId: ctx.itemA.id,
          description: "Footing F1",
          nos: "2",
          length: "3.5",
          breadth: "1.2",
          depth: "0.45",
          location: { type: "location", locationId },
        },
        // Blank breadth: nos × L × D.
        { boqItemId: ctx.itemA.id, length: "12.5", depth: "0.15" },
        // A deduction from a negative nos.
        {
          boqItemId: ctx.itemA.id,
          description: "Sump opening",
          nos: "-1",
          length: "0.3333",
          breadth: "0.5",
        },
        { boqItemId: ctx.itemB.id, direct: true, quantity: "4.25" },
      ],
    });
    expect(draft).toMatchObject({
      side: "client",
      status: "draft",
      workOrderId: null,
      partyLabel: "Chennai Metro Rail",
      projectName: "Metro Depot",
      role: "contract",
      rowCount: 4,
      deviationLimitPercent: "25.00",
      allowed: {
        edit: true,
        submit: true,
        delete: true,
        check: false,
        photos: true,
      },
    });
    expect(draft.rows.map((row) => row.quantity)).toEqual([
      "3.7800",
      "1.8750",
      "-0.1667",
      "4.2500",
    ]);
    expect(draft.rows[0]).toMatchObject({
      location: { type: "location", locationId },
      item: { itemNo: "1.1", uomName: "cum", quantity: "100.0000" },
      over: false,
    });
    expect(draft.rows[3]).toMatchObject({ direct: true, nos: null });
    expect(draft.items).toEqual([
      expect.objectContaining({
        itemId: ctx.itemA.id,
        checked: "0.0000",
        thisSheet: "5.4883",
        total: "5.4883",
        over: false,
      }),
      expect.objectContaining({ itemId: ctx.itemB.id, total: "4.2500" }),
    ]);

    const submitted = json<Sheet>(await api.submit(draft.id));
    expect(await submitted).toMatchObject({
      status: "submitted",
      submittedBy: ctx.by,
      allowed: { edit: false, check: true, return: true },
    });
    expect(events.of("MeasurementSubmitted")).toEqual([
      expect.objectContaining({
        sheetId: draft.id,
        projectId: ctx.projectId,
        side: "client",
        title: "Footings F1–F4",
        partyName: "Chennai Metro Rail",
        rowCount: 4,
        by: ctx.by,
      }),
    ]);

    const checked = await json<Sheet>(await api.check(draft.id, JOINT));
    expect(checked).toMatchObject({
      status: "checked",
      checkedBy: ctx.by,
      partyName: "R. Kumar",
      partyRole: "Client's engineer",
      jointOn: TODAY,
      allowed: { reopen: true, edit: false },
    });
    const audit = await prisma.constructionOrganizationAuditEvent.findMany({
      where: { entityId: draft.id },
      orderBy: { occurredAt: "asc" },
    });
    expect(audit.map((row) => row.action)).toEqual([
      "measurement_sheet.created",
      "measurement_sheet.submitted",
      "measurement_sheet.checked",
    ]);

    const page = await json<ListConstructionContractsMeasurementsResponseModel>(
      await api.list(`projectId=${ctx.projectId}&side=client&status=checked`),
    );
    expect(page.items.map((item) => item.id)).toEqual([draft.id]);
    expect(page.viewerFlags).toContain("notification");
    const none = await json<ListConstructionContractsMeasurementsResponseModel>(
      await api.list(`projectId=${ctx.projectId}&to=${addDays(YESTERDAY, -1)}`),
    );
    expect(none.total).toBe(0);
  });

  it("edits a draft, refuses a stale edit and a sheet with no rows on submit", async () => {
    const ctx = await setup();
    const draft = await ctx.created({});
    const empty = await api.submit(draft.id);
    expect(empty.status).toBe(StatusCodes.BAD_REQUEST);
    expect((await errorOf(empty)).code).toBe("MEASUREMENT_ROWS_REQUIRED");
    const edited = await json<Sheet>(
      await api.update(draft.id, {
        ...formOf(draft),
        title: "Day 2",
        rows: [{ boqItemId: ctx.itemA.id, nos: "3" }],
      }),
    );
    expect(edited.title).toBe("Day 2");
    expect(edited.rows.map((row) => row.quantity)).toEqual(["3.0000"]);
    const stale = await api.update(draft.id, formOf(draft));
    expect(stale.status).toBe(StatusCodes.CONFLICT);
    expect((await errorOf(stale)).code).toBe("MEASUREMENT_CHANGED");
    const future = await api.update(draft.id, {
      ...formOf(edited),
      measuredOn: addDays(TODAY, 1),
    });
    expect((await errorOf(future)).code).toBe("MEASURED_ON_IN_FUTURE");
  });

  it("keeps each side to its own items", async () => {
    const ctx = await setup();
    const issued = await ctx.workOrder();
    const other = await ctx.workOrder();
    const lineA = issued.lines[0]?.id ?? "";
    // A BOQ item on the contractor side.
    const boqOnContractor = await api.create({
      projectId: ctx.projectId,
      side: "contractor",
      workOrderId: issued.id,
      measuredOn: YESTERDAY,
      rows: [{ boqItemId: ctx.itemA.id, nos: "1" }],
    });
    expect(boqOnContractor.status).toBe(StatusCodes.BAD_REQUEST);
    expect(await errorOf(boqOnContractor)).toMatchObject({
      code: "MEASUREMENT_ITEM_INVALID",
      details: { row: 0, field: "rows.0.workOrderLineId" },
    });
    // A line of another Work Order.
    const otherLine = await api.create({
      projectId: ctx.projectId,
      side: "contractor",
      workOrderId: issued.id,
      measuredOn: YESTERDAY,
      rows: [{ workOrderLineId: other.lines[0]?.id, nos: "1" }],
    });
    expect(otherLine.status).toBe(StatusCodes.BAD_REQUEST);
    expect((await errorOf(otherLine)).code).toBe("MEASUREMENT_ITEM_INVALID");
    // A Work Order line on the client side.
    const lineOnClient = await api.create({
      projectId: ctx.projectId,
      side: "client",
      measuredOn: YESTERDAY,
      rows: [{ workOrderLineId: lineA, nos: "1" }],
    });
    expect((await errorOf(lineOnClient)).code).toBe("MEASUREMENT_ITEM_INVALID");
    // The client side names no Work Order; the contractor side needs one.
    expect(
      (
        await errorOf(
          await api.create({
            projectId: ctx.projectId,
            side: "client",
            workOrderId: issued.id,
            measuredOn: YESTERDAY,
            rows: [],
          }),
        )
      ).code,
    ).toBe("MEASUREMENT_WORK_ORDER_NOT_ALLOWED");
    expect(
      (
        await errorOf(
          await api.create({
            projectId: ctx.projectId,
            side: "contractor",
            measuredOn: YESTERDAY,
            rows: [],
          }),
        )
      ).code,
    ).toBe("MEASUREMENT_WORK_ORDER_REQUIRED");
    // A location not on the Project.
    const nowhere = await api.create({
      projectId: ctx.projectId,
      side: "client",
      measuredOn: YESTERDAY,
      rows: [
        {
          boqItemId: ctx.itemA.id,
          nos: "1",
          location: { type: "location", locationId: newId() },
        },
      ],
    });
    expect(nowhere.status).toBe(StatusCodes.BAD_REQUEST);
    expect((await errorOf(nowhere)).details).toMatchObject({ row: 0 });
  });

  it("measures only issued Work Orders, and warns past a line's quantity", async () => {
    const ctx = await setup();
    const draftOrder = await ctx.workOrder(false);
    const notIssued = await api.create({
      projectId: ctx.projectId,
      side: "contractor",
      workOrderId: draftOrder.id,
      measuredOn: YESTERDAY,
      rows: [],
    });
    expect(notIssued.status).toBe(StatusCodes.BAD_REQUEST);
    expect((await errorOf(notIssued)).code).toBe(
      "MEASUREMENT_WORK_ORDER_INVALID",
    );
    const issued = await ctx.workOrder();
    const [boqLine, extraLine] = issued.lines;
    const options =
      await json<ConstructionContractsMeasurementFormOptionsResponseModel>(
        await api.formOptions(ctx.projectId),
      );
    expect(options.workOrders.map((order) => order.id)).toEqual([issued.id]);
    expect(options.workOrders[0]?.lines.map((line) => line.quantity)).toEqual([
      "40.0000",
      "5.0000",
    ]);
    expect(options.boqItems.map((item) => item.itemNo)).toEqual(["1.1", "1.2"]);

    await ctx.checked({
      side: "contractor",
      workOrderId: issued.id,
      rows: [{ workOrderLineId: boqLine?.id, nos: "30" }],
    });
    const sheet = await ctx.created({
      side: "contractor",
      workOrderId: issued.id,
      rows: [
        { workOrderLineId: boqLine?.id, nos: "8" },
        { workOrderLineId: boqLine?.id, nos: "4" },
        { workOrderLineId: extraLine?.id, nos: "2" },
      ],
    });
    expect(sheet).toMatchObject({
      partyLabel: "Velan Constructions",
      workOrderNumber: issued.number,
      deviationLimitPercent: null,
    });
    expect(sheet.rows.map((row) => row.over)).toEqual([false, true, false]);
    expect(sheet.items[0]).toMatchObject({
      checked: "30.0000",
      thisSheet: "12.0000",
      total: "42.0000",
      over: true,
      overLimit: false,
    });
    expect(sheet.warnings).toEqual([
      {
        lineId: boqLine?.id,
        message: expect.stringContaining(
          "WORK_ORDER_QUANTITY_EXCEEDED",
        ) as string,
      },
    ]);
    const quantities =
      await json<ListConstructionContractsMeasurementQuantitiesResponseModel>(
        await api.quantities(
          `projectId=${ctx.projectId}&side=contractor&workOrderId=${issued.id}`,
        ),
      );
    expect(
      quantities.items.map((item) => [item.checked, item.pending, item.over]),
    ).toEqual([
      ["30.0000", "0.0000", false],
      ["0.0000", "0.0000", false],
    ]);
    const missing = await api.quantities(
      `projectId=${ctx.projectId}&side=contractor`,
    );
    expect((await errorOf(missing)).code).toBe(
      "MEASUREMENT_WORK_ORDER_REQUIRED",
    );
  });

  it("marks client-side deviation and links items past the limit", async () => {
    const ctx = await setup();
    await ctx.checked({
      rows: [{ boqItemId: ctx.itemB.id, direct: true, quantity: "9" }],
    });
    const sheet = await ctx.created({
      rows: [
        { boqItemId: ctx.itemB.id, nos: "1" },
        { boqItemId: ctx.itemB.id, nos: "3" },
      ],
    });
    expect(sheet.rows.map((row) => row.over)).toEqual([false, true]);
    expect(sheet.items[0]).toMatchObject({
      planned: "10.0000",
      checked: "9.0000",
      total: "13.0000",
      over: true,
      overLimit: true,
      percentOver: "30.00",
    });
    expect((await api.submit(sheet.id)).status).toBe(StatusCodes.OK);
    const quantities =
      await json<ListConstructionContractsMeasurementQuantitiesResponseModel>(
        await api.quantities(`projectId=${ctx.projectId}&side=client`),
      );
    expect(
      quantities.items.map((item) => [item.itemNo, item.checked, item.pending]),
    ).toEqual([
      ["1.1", "0.0000", "0.0000"],
      ["1.2", "9.0000", "4.0000"],
    ]);
  });

  it("needs Approve and the joint measurement's party fields to check", async () => {
    const ctx = await setup();
    const draft = await ctx.created({
      rows: [{ boqItemId: ctx.itemA.id, nos: "1" }],
    });
    const early = await api.check(draft.id, JOINT);
    expect(early.status).toBe(StatusCodes.CONFLICT);
    expect((await errorOf(early)).code).toBe("MEASUREMENT_STATUS_INVALID");
    expect((await api.submit(draft.id)).status).toBe(StatusCodes.OK);

    actAs(await member(ctx, ["read", "create", "update"]));
    const denied = await api.check(draft.id, JOINT);
    expect(denied.status).toBe(StatusCodes.FORBIDDEN);
    expect((await api.returnToDraft(draft.id, "No")).status).toBe(
      StatusCodes.FORBIDDEN,
    );

    actAs(await member(ctx, ["read", "approve"]));
    for (const [change, code] of [
      [{ partyName: " " }, "PARTY_NAME_REQUIRED"],
      [{ partyRole: "" }, "PARTY_ROLE_REQUIRED"],
      [{ jointOn: addDays(TODAY, 1) }, "JOINT_ON_IN_FUTURE"],
      [{ jointOn: addDays(YESTERDAY, -1) }, "JOINT_ON_BEFORE_MEASURED_ON"],
    ] as const) {
      const refused = await api.check(draft.id, { ...JOINT, ...change });
      expect(refused.status, code).toBe(StatusCodes.BAD_REQUEST);
      expect((await errorOf(refused)).code).toBe(code);
    }
    const returned = await json<Sheet>(
      await api.returnToDraft(draft.id, "Recheck footing F2"),
    );
    expect(returned).toMatchObject({
      status: "draft",
      returnReason: "Recheck footing F2",
      submittedAt: null,
    });
    const blank = await api.returnToDraft(draft.id, " ");
    expect(blank.status).toBe(StatusCodes.BAD_REQUEST);

    actAs(ctx.owner);
    expect((await api.submit(draft.id)).status).toBe(StatusCodes.OK);
    const resubmitted = await ctx.read(draft.id);
    expect(resubmitted.returnReason).toBeNull();
    const audit = await prisma.constructionOrganizationAuditEvent.findMany({
      where: { entityId: draft.id, action: "measurement_sheet.returned" },
    });
    expect(audit[0]?.after).toMatchObject({ reason: "Recheck footing F2" });
  });

  it("locks BOQ items once checked, and frees them on reopen", async () => {
    const ctx = await setup();
    const sheet = await ctx.checked({
      rows: [{ boqItemId: ctx.itemA.id, nos: "40.5" }],
    });
    const body = {
      sectionId: ctx.section.id,
      itemNo: ctx.itemA.itemNo,
      description: ctx.itemA.description,
      uomId: ctx.itemA.uomId,
      quantity: "120",
      rate: ctx.itemA.rate,
      expectedUpdatedAt: ctx.itemA.updatedAt,
    };
    const updateItem = () =>
      updateBoqItemRoute(
        request(`${BOQ}/items/${ctx.itemA.id}/update`, body),
        params(ctx.itemA.id),
      );
    const refused = await updateItem();
    expect(refused.status).toBe(StatusCodes.CONFLICT);
    expect((await errorOf(refused)).code).toBe("BOQ_ITEM_MEASURED");

    const blank = await api.reopen(sheet.id, "");
    expect((await errorOf(blank)).code).toBe("REOPEN_REASON_REQUIRED");
    const reopened = await json<Sheet>(
      await api.reopen(sheet.id, "Wrong footing size"),
    );
    expect(reopened).toMatchObject({
      status: "submitted",
      reopenReason: "Wrong footing size",
      checkedBy: null,
      partyName: null,
      jointOn: null,
    });
    // No checked row names the item any more.
    expect((await updateItem()).status).toBe(StatusCodes.OK);
  });

  it("makes a billed sheet read-only", async () => {
    const ctx = await setup();
    const sheet = await ctx.checked({
      rows: [{ boqItemId: ctx.itemA.id, nos: "2" }],
    });
    const draft = await ctx.created({
      rows: [{ boqItemId: ctx.itemA.id, nos: "1" }],
    });
    // Bills are CM-1106: set `bill_id` straight on the rows.
    await prisma.constructionContractsMeasurementRow.updateMany({
      where: { sheetId: { in: [sheet.id, draft.id] } },
      data: { billId: newId() },
    });
    const billed = await ctx.read(sheet.id);
    expect(billed).toMatchObject({
      billed: true,
      allowed: { reopen: false, delete: false, photos: false },
    });
    for (const response of [
      await api.reopen(sheet.id, "Wrong"),
      await api.remove(sheet.id),
      await api.update(draft.id, formOf(await ctx.read(draft.id))),
      await api.submit(draft.id),
      await api.remove(draft.id),
    ]) {
      expect(response.status).toBe(StatusCodes.CONFLICT);
      expect((await errorOf(response)).code).toBe("MEASUREMENT_BILLED");
    }
  });

  it("deletes a draft for its creator, a checked sheet only with Delete", async () => {
    const ctx = await setup();
    const checked = await ctx.checked({
      rows: [{ boqItemId: ctx.itemA.id, nos: "1" }],
    });
    const creator = await member(ctx, ["read", "create"]);
    actAs(creator);
    const own = await ctx.created({
      rows: [{ boqItemId: ctx.itemA.id, nos: "1" }],
    });
    expect((await api.remove(checked.id)).status).toBe(StatusCodes.FORBIDDEN);
    expect((await api.remove(own.id)).status).toBe(StatusCodes.NO_CONTENT);
    actAs(await member(ctx, ["read", "delete"]));
    expect((await api.remove(checked.id)).status).toBe(StatusCodes.NO_CONTENT);
    actAs(ctx.owner);
    expect((await api.get(checked.id)).status).toBe(StatusCodes.NOT_FOUND);
  });

  it("applies the back-dated limit to the date measured", async () => {
    const ctx = await setup();
    const old = await ctx.created({ measuredOn: addDays(TODAY, -30) });
    await prisma.constructionOrganizationBackdatedEntryPolicy.create({
      data: {
        id: newId(),
        workspaceId: ctx.ws,
        createDays: 0,
        createOverrideDesignationIds: [],
        editDays: 0,
        editOverrideDesignationIds: [],
        modules: {
          measurement: {
            mode: "custom",
            create: { days: 3, overrideDesignationIds: [] },
            edit: { days: 3, overrideDesignationIds: [] },
          },
        },
        createdBy: ctx.by,
        updatedBy: ctx.by,
      },
    });
    actAs(await member(ctx, ["read", "create", "update"]));
    const refused = await api.create({
      projectId: ctx.projectId,
      side: "client",
      measuredOn: addDays(TODAY, -10),
      rows: [],
    });
    expect(refused.status).toBe(StatusCodes.FORBIDDEN);
    expect((await errorOf(refused)).code).toBe("BACKDATED_CREATE_BLOCKED");
    const edited = await api.update(old.id, formOf(old));
    expect((await errorOf(edited)).code).toBe("BACKDATED_EDIT_BLOCKED");
    const recent = await api.create({
      projectId: ctx.projectId,
      side: "client",
      measuredOn: addDays(TODAY, -2),
      rows: [],
    });
    expect(recent.status).toBe(StatusCodes.CREATED);
  });

  it("measures the budget BOQ of an Own development Project too", async () => {
    const ctx = await setup();
    await prisma.constructionProjectsProject.update({
      where: { id: ctx.projectId },
      data: { role: "own", clientName: null },
    });
    const sheet = await ctx.created({
      rows: [{ boqItemId: ctx.itemA.id, nos: "1" }],
    });
    expect(sheet).toMatchObject({ role: "own", partyLabel: null });
  });

  it("keeps photos on the sheet, out of the Gallery", async () => {
    const ctx = await setup();
    const sheet = await ctx.created({
      rows: [{ boqItemId: ctx.itemA.id, nos: "1" }],
    });
    const photos = `${TEST_ORIGIN}/api/construction/contracts/measurements/${sheet.id}/photos`;
    const started = await startPhotoRoute(
      request(`${photos}/uploads`, { fileName: "footing.png", bytes: 64 }),
      params(sheet.id),
    );
    expect(started.status).toBe(StatusCodes.CREATED);
    const start = await json<{
      key: string;
      fileName: string;
      upload: { via: string; url: string };
    }>(started);
    const sent = await receivePhotoRoute(
      new Request(`${TEST_ORIGIN}${start.upload.url}`, {
        method: "POST",
        headers: { "content-type": "application/octet-stream" },
        body: pngBytes(),
      }),
      params(sheet.id),
    );
    expect(sent.status).toBe(StatusCodes.NO_CONTENT);
    const done = await completePhotoRoute(
      request(photos, { key: start.key, fileName: start.fileName }),
      params(sheet.id),
    );
    expect(done.status).toBe(StatusCodes.CREATED);
    const photo = await json<{ id: string; url: string; canRemove: boolean }>(
      done,
    );
    expect(photo.canRemove).toBe(true);
    const listed =
      await json<ListConstructionContractsMeasurementPhotosResponseModel>(
        await photosRoute(request(photos), params(sheet.id)),
      );
    expect(listed).toMatchObject({
      canUpload: true,
      items: [{ id: photo.id }],
    });
    expect((await ctx.read(sheet.id)).photoCount).toBe(1);
    const streamed = await photoRoute(request(`${photos}/${photo.id}`), {
      params: Promise.resolve({ id: sheet.id, photoId: photo.id }),
    });
    expect(streamed.status).toBe(StatusCodes.OK);
    expect(streamed.headers.get("content-type")).toBe("image/png");
    expect(
      await prisma.constructionProjectsMediaItem.count({
        where: { workspaceId: ctx.ws },
      }),
    ).toBe(0);
    expect(
      (
        await deletePhotoRoute(request(`${photos}/${photo.id}/delete`, {}), {
          params: Promise.resolve({ id: sheet.id, photoId: photo.id }),
        })
      ).status,
    ).toBe(StatusCodes.NO_CONTENT);
  });

  it("keeps every sheet inside its Company and its Project's team", async () => {
    const ctx = await setup();
    const draft = await ctx.created({
      rows: [{ boqItemId: ctx.itemA.id, nos: "1" }],
    });
    const stranger = await newCompany();
    actAs({
      userId: stranger.ownerId,
      workspaceId: stranger.workspaceId,
      role: "owner",
    });
    for (const response of [
      await api.get(draft.id),
      await api.submit(draft.id),
      await api.check(draft.id, JOINT),
    ]) {
      expect(response.status).toBe(StatusCodes.NOT_FOUND);
      expect((await errorOf(response)).code).toBe("MEASUREMENT_NOT_FOUND");
    }
    expect((await api.list(`projectId=${ctx.projectId}`)).status).toBe(
      StatusCodes.NOT_FOUND,
    );
    actAs(await member(ctx, ["read", "create", "approve"], false));
    expect((await api.list(`projectId=${ctx.projectId}`)).status).toBe(
      StatusCodes.FORBIDDEN,
    );
    expect((await api.get(draft.id)).status).toBe(StatusCodes.FORBIDDEN);
    expect((await api.formOptions(ctx.projectId)).status).toBe(
      StatusCodes.FORBIDDEN,
    );
  });

  it("is on /api/docs with ConstructionContracts Measurement components", async () => {
    const spec = await json<{
      paths: Record<string, Record<string, unknown>>;
      components: { schemas: Record<string, unknown> };
    }>(getOpenApi());
    const base = "/api/construction/contracts/measurements";
    expect(spec.paths[base]?.["get"]).toBeDefined();
    expect(spec.paths[base]?.["post"]).toBeDefined();
    for (const path of ["form-options", "quantities"])
      expect(spec.paths[`${base}/${path}`]?.["get"]).toBeDefined();
    expect(spec.paths[`${base}/{id}`]?.["get"]).toBeDefined();
    for (const step of [
      "update",
      "delete",
      "submit",
      "check",
      "return",
      "reopen",
    ])
      expect(spec.paths[`${base}/{id}/${step}`]?.["post"]).toBeDefined();
    expect(spec.paths[`${base}/{id}/photos`]?.["get"]).toBeDefined();
    expect(
      spec.components.schemas["GetConstructionContractsMeasurementResponse"],
    ).toBeDefined();
  });
});
