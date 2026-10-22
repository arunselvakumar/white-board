import { prisma } from "@repo/construction-db";
import { StatusCodes } from "http-status-codes";
import { afterEach, describe, expect, it, vi } from "vitest";

import { GET as getOpenApi } from "@/app/api/openapi.json/route";
import type { Flag } from "@/src/shared-kernel/access";
import { actAs, addMember, addProject, newCompany } from "@/test/companies";
import {
  addAnalysisMaterial,
  addContractorBill,
  addLibraryItem,
} from "@/test/contracts";
import { watchEvents } from "@/test/dispatched-events";
import { contractorTds } from "@/test/party-finance";
import { addMaterial, unitNamed } from "@/test/procurement";
import {
  sharedAssign,
  worksheetContractor,
  worksheetDepartment,
} from "@/test/site-work";

import type {
  ConstructionContractsBoqItemModel,
  ConstructionContractsBoqSectionResponseModel,
} from "../boq/boq-models";
import { POST as deleteBoqItemRoute } from "../boq/items/[id]/delete/route";
import { POST as createBoqItemRoute } from "../boq/items/route";
import { POST as createSectionRoute } from "../boq/sections/route";
import { POST as amendRoute } from "./[id]/amend/route";
import { POST as approveRoute } from "./[id]/approve/route";
import { POST as cancelRoute } from "./[id]/cancel/route";
import { POST as closeRoute } from "./[id]/close/route";
import { POST as deleteRoute } from "./[id]/delete/route";
import { GET as pdfRoute } from "./[id]/pdf/route";
import { POST as rejectRoute } from "./[id]/reject/route";
import { GET as getRoute } from "./[id]/route";
import { POST as submitRoute } from "./[id]/submit/route";
import { POST as updateRoute } from "./[id]/update/route";
import { GET as boqItemsRoute } from "./boq-items/route";
import { GET as formOptionsRoute } from "./form-options/route";
import { GET as listRoute, POST as createRoute } from "./route";
import type {
  GetConstructionContractsWorkOrderResponseModel,
  ListConstructionContractsWorkOrderBoqItemsResponseModel,
  ListConstructionContractsWorkOrdersResponseModel,
  ConstructionContractsWorkOrderFormOptionsResponseModel,
} from "./work-order-models";

vi.mock(import("@repo/auth/construction/server"), async (importOriginal) => ({
  ...(await importOriginal()),
  getCompanyAuthFromHeaders: vi.fn(),
}));

afterEach(() => {
  vi.restoreAllMocks();
});

const BASE = "http://localhost/api/construction/contracts/work-orders";
const BOQ = "http://localhost/api/construction/contracts/boq";

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
  approve: (id: string) =>
    approveRoute(request(`${BASE}/${id}/approve`, {}), params(id)),
  reject: (id: string, reason: string) =>
    rejectRoute(request(`${BASE}/${id}/reject`, { reason }), params(id)),
  amend: (id: string, body: Record<string, unknown>) =>
    amendRoute(request(`${BASE}/${id}/amend`, body), params(id)),
  close: (id: string, body: Record<string, unknown>) =>
    closeRoute(request(`${BASE}/${id}/close`, body), params(id)),
  cancel: (id: string, reason: string) =>
    cancelRoute(request(`${BASE}/${id}/cancel`, { reason }), params(id)),
  pdf: (id: string) => pdfRoute(request(`${BASE}/${id}/pdf`), params(id)),
};

async function setup() {
  const company = await newCompany();
  const ws = company.workspaceId;
  const by = company.ownerId;
  const owner = { userId: by, workspaceId: ws, role: "owner" as const };
  const projectId = await addProject(ws, by, "Metro Depot");
  const cum = await unitNamed(ws, by, "cum");
  const departmentId = await worksheetDepartment(ws, by, { name: "Masonry" });
  const contractorId = await worksheetContractor(ws, by, {
    projectIds: [projectId],
    departmentIds: [departmentId],
    name: "Velan Constructions",
  });
  await contractorTds(contractorId, { tdsApplicable: true });
  actAs(owner);
  const section = await json<ConstructionContractsBoqSectionResponseModel>(
    await createSectionRoute(
      request(`${BOQ}/sections`, { projectId, title: "Earthwork" }),
    ),
  );
  const addBoqItem = async (
    itemNo: string,
    quantity = "100",
    rate = 450_00,
    extra: Record<string, unknown> = {},
  ) => {
    const response = await createBoqItemRoute(
      request(`${BOQ}/items`, {
        projectId,
        sectionId: section.id,
        itemNo,
        description: `Excavation ${itemNo}`,
        uomId: cum,
        sacHsn: "9954",
        quantity,
        rate,
        ...extra,
      }),
    );
    expect(response.status).toBe(StatusCodes.CREATED);
    return json<ConstructionContractsBoqItemModel>(response);
  };
  const itemA = await addBoqItem("1.1");
  const itemB = await addBoqItem("1.2", "50", 300_00);
  const body = (extra: Record<string, unknown> = {}) => ({
    projectId,
    contractorId,
    orderDate: "2026-10-20",
    scope: "Earthwork for the depot",
    lines: [
      { kind: "boq", boqItemId: itemA.id, rate: 400_00 },
      {
        kind: "non_boq",
        itemNo: "NB-1",
        description: "Dewatering",
        uomId: cum,
        quantity: "10",
        rate: 125_50,
      },
    ],
    ...extra,
  });
  const created = async (extra: Record<string, unknown> = {}) => {
    const response = await api.create(body(extra));
    expect(response.status, JSON.stringify(await response.clone().json())).toBe(
      StatusCodes.CREATED,
    );
    return json<WorkOrder>(response);
  };
  const read = async (id: string) => json<WorkOrder>(await api.get(id));
  /** Created, submitted and approved. */
  const issued = async (extra: Record<string, unknown> = {}) => {
    const draft = await created(extra);
    expect((await api.submit(draft.id)).status).toBe(StatusCodes.OK);
    const approved = await api.approve(draft.id);
    expect(approved.status).toBe(StatusCodes.OK);
    return json<WorkOrder>(approved);
  };
  return {
    ws,
    by,
    owner,
    projectId,
    cum,
    departmentId,
    contractorId,
    section,
    itemA,
    itemB,
    addBoqItem,
    body,
    created,
    read,
    issued,
  };
}

type Ctx = Awaited<ReturnType<typeof setup>>;

async function member(ctx: Ctx, flags: Flag[], onProject = true) {
  const added = await addMember(ctx.ws, ctx.by, {
    "contracts.work_orders": flags,
    "contracts.boq": ["read"],
  });
  if (onProject) await sharedAssign(added.memberId, ctx.projectId);
  return { userId: added.userId, workspaceId: ctx.ws, role: "member" as const };
}

/** The form's fields of a Work Order as loaded, to send back on an edit. */
function formOf(workOrder: WorkOrder) {
  return {
    contractorId: workOrder.contractorId,
    departmentId: workOrder.departmentId,
    orderDate: workOrder.orderDate,
    validUntil: workOrder.validUntil,
    scope: workOrder.scope,
    lines: workOrder.lines.map((line) => ({
      id: line.id,
      kind: line.kind,
      boqItemId: line.boqItemId,
      itemNo: line.itemNo,
      description: line.description,
      uomId: line.uomId,
      sacHsn: line.sacHsn,
      quantity: line.quantity,
      rate: line.rate,
    })),
    expectedUpdatedAt: workOrder.updatedAt,
  };
}

describe("Work Orders (CM-1104)", () => {
  it("drafts a Work Order with BOQ lines filled from the BOQ and non-BOQ lines", async () => {
    const ctx = await setup();
    const workOrder = await ctx.created({
      departmentId: ctx.departmentId,
      validUntil: "2027-03-31",
      terms: {
        retentionPercent: "5",
        retentionCapPercent: "5",
        dlpMonths: 12,
        sacCode: "9954",
        gstRate: "18",
        mobilisationAdvance: 5_00_000_00,
        mobilisationRecoveryPercent: "10",
      },
    });
    expect(workOrder).toMatchObject({
      number: null,
      status: "draft",
      revision: 0,
      projectName: "Metro Depot",
      contractorName: "Velan Constructions",
      departmentName: "Masonry",
      orderDate: "2026-10-20",
      validUntil: "2027-03-31",
      terms: {
        retentionPercent: "5.00",
        retentionCapPercent: "5.00",
        retentionCompletionPercent: "50.00",
        dlpMonths: 12,
        tdsNature: "contractor",
        sacCode: "9954",
        gstRate: "18.00",
        reverseCharge: false,
        mobilisationAdvance: 5_00_000_00,
        mobilisationRecoveryPercent: "10.00",
      },
      warnings: [],
      financial: true,
    });
    expect(workOrder.lines).toEqual([
      expect.objectContaining({
        kind: "boq",
        boqItemId: ctx.itemA.id,
        itemNo: "1.1",
        description: "Excavation 1.1",
        uomName: "cum",
        sacHsn: "9954",
        quantity: "100.0000",
        rate: 400_00,
        amount: 40_000_00,
        billed: "0.0000",
        remaining: "100.0000",
      }),
      expect.objectContaining({
        kind: "non_boq",
        itemNo: "NB-1",
        quantity: "10.0000",
        rate: 125_50,
        amount: 1255_00,
      }),
    ]);
    expect(workOrder.value).toBe(40_000_00 + 1255_00);
    const audit = await prisma.constructionOrganizationAuditEvent.findMany({
      where: { entityId: workOrder.id },
    });
    expect(audit.map((row) => row.action)).toEqual(["work_order.created"]);

    const page = await json<ListConstructionContractsWorkOrdersResponseModel>(
      await api.list(`projectId=${ctx.projectId}&q=depot`),
    );
    expect(page.items.map((item) => item.id)).toEqual([workOrder.id]);
    expect(page.items[0]).toMatchObject({ value: 41_255_00, lineCount: 2 });
    const none = await json<ListConstructionContractsWorkOrdersResponseModel>(
      await api.list(`projectId=${ctx.projectId}&status=issued`),
    );
    expect(none.total).toBe(0);
  });

  it("warns, never refuses, when lines order more than the BOQ has left", async () => {
    const ctx = await setup();
    await ctx.created();
    const options =
      await json<ListConstructionContractsWorkOrderBoqItemsResponseModel>(
        await boqItemsRoute(
          request(`${BASE}/boq-items?projectId=${ctx.projectId}`),
        ),
      );
    expect(
      options.items.map((item) => [item.itemNo, item.remaining, item.rate]),
    ).toEqual([
      ["1.1", "0.0000", 450_00],
      ["1.2", "50.0000", 300_00],
    ]);
    const second = await ctx.created({
      lines: [
        { kind: "boq", boqItemId: ctx.itemA.id, quantity: "30" },
        { kind: "boq", boqItemId: ctx.itemB.id, quantity: "20" },
      ],
    });
    expect(second.lines[0]).toMatchObject({
      rate: 450_00,
      remaining: "0.0000",
    });
    expect(second.warnings).toEqual([
      {
        code: "WORK_ORDER_QUANTITY_OVER_REMAINING",
        boqItemId: ctx.itemA.id,
        itemNo: "1.1",
        ordered: "30.0000",
        remaining: "0.0000",
        message:
          "BOQ item 1.1: ordering 30, the BOQ has nothing left after other Work Orders.",
      },
    ]);
  });

  it("refuses a Contractor not on the Project, or a Department not its own", async () => {
    const ctx = await setup();
    const elsewhere = await worksheetContractor(ctx.ws, ctx.by, {
      projectIds: [await addProject(ctx.ws, ctx.by)],
    });
    const response = await api.create(ctx.body({ contractorId: elsewhere }));
    expect(response.status).toBe(StatusCodes.BAD_REQUEST);
    expect((await errorOf(response)).code).toBe(
      "WORK_ORDER_CONTRACTOR_INVALID",
    );
    const other = await worksheetDepartment(ctx.ws, ctx.by);
    const wrong = await api.create(ctx.body({ departmentId: other }));
    expect(wrong.status).toBe(StatusCodes.BAD_REQUEST);
    expect((await errorOf(wrong)).code).toBe("WORK_ORDER_DEPARTMENT_INVALID");
    const options =
      await json<ConstructionContractsWorkOrderFormOptionsResponseModel>(
        await formOptionsRoute(
          request(`${BASE}/form-options?projectId=${ctx.projectId}`),
        ),
      );
    expect(options.contractors).toEqual([
      expect.objectContaining({
        id: ctx.contractorId,
        defaultTdsNature: "contractor",
        departments: [{ id: ctx.departmentId, name: "Masonry" }],
      }),
    ]);
  });

  it("numbers a Work Order when first submitted; reject sends it back to draft and keeps the number", async () => {
    const ctx = await setup();
    const events = watchEvents();
    const draft = await ctx.created();
    const submitted = await json<WorkOrder>(await api.submit(draft.id));
    expect(submitted.status).toBe("pending_approval");
    expect(submitted.number).toMatch(/^WO\/\d{2}-\d{2}\/00001$/);
    const edit = await api.update(draft.id, formOf(submitted));
    expect(edit.status).toBe(StatusCodes.CONFLICT);
    expect((await errorOf(edit)).code).toBe("WORK_ORDER_STATUS_INVALID");

    const rejected = await json<WorkOrder>(
      await api.reject(draft.id, "  Rate too high  "),
    );
    expect(rejected).toMatchObject({
      status: "draft",
      number: submitted.number,
      rejectReason: "Rate too high",
    });
    const again = await json<WorkOrder>(await api.submit(draft.id));
    expect(again).toMatchObject({
      number: submitted.number,
      rejectReason: null,
    });
    const approved = await json<WorkOrder>(await api.approve(draft.id));
    expect(approved).toMatchObject({
      status: "issued",
      decidedByName: "Arun Selva Kumar",
    });
    const reapprove = await api.approve(draft.id);
    expect(reapprove.status).toBe(StatusCodes.CONFLICT);
    expect((await errorOf(reapprove)).code).toBe("WORK_ORDER_NOT_PENDING");

    const second = await ctx.created({
      lines: [{ kind: "boq", boqItemId: ctx.itemB.id, quantity: "5" }],
    });
    expect((await json<WorkOrder>(await api.submit(second.id))).number).toMatch(
      /00002$/,
    );
    expect(events.of("document.submitted")).toEqual([
      expect.objectContaining({
        documentType: "work_order",
        documentId: draft.id,
        projectId: ctx.projectId,
        number: submitted.number,
      }),
      expect.objectContaining({ documentId: draft.id }),
      expect.objectContaining({ documentId: second.id }),
    ]);
    expect(events.of("document.rejected")).toEqual([
      expect.objectContaining({
        documentType: "work_order",
        reason: "Rate too high",
      }),
    ]);
    expect(events.of("WorkOrderIssued")).toEqual([
      expect.objectContaining({
        workOrderId: draft.id,
        number: submitted.number,
        contractorName: "Velan Constructions",
        by: ctx.by,
      }),
    ]);
    const audit = await prisma.constructionOrganizationAuditEvent.findMany({
      where: { entityId: draft.id },
      orderBy: { occurredAt: "asc" },
    });
    expect(audit.map((row) => row.action)).toEqual([
      "work_order.created",
      "work_order.submitted",
      "work_order.rejected",
      "work_order.submitted",
      "work_order.approved",
    ]);
  });

  it("needs Approve to approve and Reject to reject", async () => {
    const ctx = await setup();
    const draft = await ctx.created();
    await api.submit(draft.id);
    actAs(await member(ctx, ["read", "create", "update", "reject"]));
    const approve = await api.approve(draft.id);
    expect(approve.status).toBe(StatusCodes.FORBIDDEN);
    expect((await errorOf(approve)).code).toBe("PERMISSION_DENIED");
    actAs(await member(ctx, ["read", "create", "update", "approve"]));
    const reject = await api.reject(draft.id, "No");
    expect(reject.status).toBe(StatusCodes.FORBIDDEN);
    const missing = await api.approve(draft.id);
    expect(missing.status).toBe(StatusCodes.OK);
  });

  it("amends an issued Work Order as a new revision, with Update and Approve and a reason", async () => {
    const ctx = await setup();
    const issued = await ctx.issued();
    const form = formOf(issued);
    const changed = {
      ...form,
      lines: [
        { ...form.lines[0], quantity: "120" },
        form.lines[1],
        { kind: "boq", boqItemId: ctx.itemB.id, quantity: "5" },
      ],
      terms: { retentionPercent: "10" },
    };
    const noReason = await api.amend(issued.id, { ...changed, reason: " " });
    expect(noReason.status).toBe(StatusCodes.BAD_REQUEST);
    expect((await errorOf(noReason)).code).toBe("AMENDMENT_REASON_REQUIRED");

    actAs(await member(ctx, ["read", "update"]));
    const denied = await api.amend(issued.id, { ...changed, reason: "More" });
    expect(denied.status).toBe(StatusCodes.FORBIDDEN);

    actAs(ctx.owner);
    const amended = await json<WorkOrder>(
      await api.amend(issued.id, { ...changed, reason: "Deeper excavation" }),
    );
    expect(amended).toMatchObject({
      status: "issued",
      revision: 1,
      number: issued.number,
      terms: { retentionPercent: "10.00", tdsNature: "contractor" },
    });
    expect(amended.lines.map((line) => [line.itemNo, line.quantity])).toEqual([
      ["1.1", "120.0000"],
      ["NB-1", "10.0000"],
      ["1.2", "5.0000"],
    ]);
    expect(amended.lines[0]?.id).toBe(issued.lines[0]?.id);
    expect(amended.warnings.map((warning) => warning.itemNo)).toEqual(["1.1"]);
    expect(amended.revisions).toHaveLength(1);
    expect(amended.revisions[0]).toMatchObject({
      revision: 0,
      reason: "Deeper excavation",
      createdByName: "Arun Selva Kumar",
      snapshot: {
        revision: 0,
        number: issued.number,
        contractorName: "Velan Constructions",
        terms: { retentionPercent: "0.00" },
        value: issued.value,
      },
    });
    expect(
      amended.revisions[0]?.snapshot.lines.map((line) => line.quantity),
    ).toEqual(["100.0000", "10.0000"]);

    const contractor = await api.amend(issued.id, {
      ...formOf(amended),
      contractorId: await worksheetContractor(ctx.ws, ctx.by, {
        projectIds: [ctx.projectId],
      }),
      reason: "Switch",
    });
    expect((await errorOf(contractor)).code).toBe(
      "WORK_ORDER_CONTRACTOR_FIXED",
    );
    const stale = await api.amend(issued.id, { ...form, reason: "Again" });
    expect(stale.status).toBe(StatusCodes.CONFLICT);
    expect((await errorOf(stale)).code).toBe("WORK_ORDER_CHANGED");
    const draft = await ctx.created({
      lines: [{ kind: "boq", boqItemId: ctx.itemB.id, quantity: "5" }],
    });
    const notIssued = await api.amend(draft.id, {
      ...formOf(draft),
      reason: "Early",
    });
    expect((await errorOf(notIssued)).code).toBe("WORK_ORDER_STATUS_INVALID");
  });

  it("keeps a billed line and its billed quantity", async () => {
    const ctx = await setup();
    const issued = await ctx.issued();
    const billedLine = issued.lines[0];
    if (billedLine == null) throw new Error("No line");
    await addContractorBill(ctx.ws, ctx.by, {
      projectId: ctx.projectId,
      workOrderId: issued.id,
      lines: [
        { workOrderLineId: billedLine.id, uomId: ctx.cum, quantity: "40" },
      ],
    });
    const detail = await ctx.read(issued.id);
    expect(detail.lines[0]?.billed).toBe("40.0000");
    const form = formOf(detail);
    const removed = await api.amend(issued.id, {
      ...form,
      lines: [form.lines[1]],
      reason: "Drop it",
    });
    expect(removed.status).toBe(StatusCodes.CONFLICT);
    expect(await errorOf(removed)).toMatchObject({
      code: "WORK_ORDER_LINE_BILLED",
      details: { lineId: billedLine.id },
    });
    const cut = await api.amend(issued.id, {
      ...form,
      lines: [{ ...form.lines[0], quantity: "30" }, form.lines[1]],
      reason: "Less",
    });
    expect(cut.status).toBe(StatusCodes.CONFLICT);
    expect(await errorOf(cut)).toMatchObject({
      code: "WORK_ORDER_QUANTITY_BELOW_BILLED",
      details: { lineId: billedLine.id, billed: "40.0000" },
    });
    const kept = await api.amend(issued.id, {
      ...form,
      lines: [{ ...form.lines[0], quantity: "40" }],
      reason: "Exactly what was billed",
    });
    expect(kept.status).toBe(StatusCodes.OK);

    const cancel = await api.cancel(issued.id, "Not needed");
    expect(cancel.status).toBe(StatusCodes.CONFLICT);
    expect((await errorOf(cancel)).code).toBe("WORK_ORDER_BILLED");
  });

  it("closes an issued Work Order once no bill on it is open", async () => {
    const ctx = await setup();
    const issued = await ctx.issued();
    const billId = await addContractorBill(ctx.ws, ctx.by, {
      projectId: ctx.projectId,
      workOrderId: issued.id,
      status: "draft",
    });
    const blocked = await api.close(issued.id, {
      closedOn: "2026-12-31",
      reason: "Work complete",
    });
    expect(blocked.status).toBe(StatusCodes.CONFLICT);
    expect((await errorOf(blocked)).code).toBe("WORK_ORDER_BILL_OPEN");
    await prisma.constructionContractsBill.update({
      where: { id: billId },
      data: { status: "approved" },
    });
    const early = await api.close(issued.id, {
      closedOn: "2026-10-19",
      reason: "Work complete",
    });
    expect((await errorOf(early)).code).toBe("CLOSED_ON_BEFORE_ORDER_DATE");
    const closed = await json<WorkOrder>(
      await api.close(issued.id, {
        closedOn: "2026-12-31",
        reason: "Work complete",
        expectedUpdatedAt: issued.updatedAt,
      }),
    );
    expect(closed).toMatchObject({
      status: "closed",
      closedOn: "2026-12-31",
      closeReason: "Work complete",
      completedOn: "2026-12-31",
      warnings: [],
    });
  });

  it("cancels a draft or issued Work Order; its lines stop counting against the BOQ", async () => {
    const ctx = await setup();
    const draft = await ctx.created();
    const cancelled = await json<WorkOrder>(
      await api.cancel(draft.id, "Raised by mistake"),
    );
    expect(cancelled).toMatchObject({
      status: "cancelled",
      cancelReason: "Raised by mistake",
    });
    expect(cancelled.cancelledOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    const again = await api.cancel(draft.id, "Twice");
    expect((await errorOf(again)).code).toBe("WORK_ORDER_STATUS_INVALID");
    const next = await ctx.created();
    expect(next.warnings).toEqual([]);
    expect(next.lines[0]?.quantity).toBe("100.0000");
  });

  it("refuses to delete a BOQ item a live Work Order line names", async () => {
    const ctx = await setup();
    const draft = await ctx.created();
    const blocked = await deleteBoqItemRoute(
      request(`${BOQ}/items/${ctx.itemA.id}/delete`, {}),
      params(ctx.itemA.id),
    );
    expect(blocked.status).toBe(StatusCodes.CONFLICT);
    expect(await errorOf(blocked)).toMatchObject({
      code: "BOQ_ITEM_IN_WORK_ORDER",
      details: { workOrders: ["Draft"] },
    });
    await api.submit(draft.id);
    const numbered = await errorOf(
      await deleteBoqItemRoute(
        request(`${BOQ}/items/${ctx.itemA.id}/delete`, {}),
        params(ctx.itemA.id),
      ),
    );
    expect(numbered.details?.["workOrders"]).toEqual([
      expect.stringMatching(/^WO\//),
    ]);
    await api.reject(draft.id, "No");
    await api.cancel(draft.id, "Dropped");
    const freed = await deleteBoqItemRoute(
      request(`${BOQ}/items/${ctx.itemA.id}/delete`, {}),
      params(ctx.itemA.id),
    );
    expect(freed.status).toBe(StatusCodes.NO_CONTENT);
    const unused = await deleteBoqItemRoute(
      request(`${BOQ}/items/${ctx.itemB.id}/delete`, {}),
      params(ctx.itemB.id),
    );
    expect(unused.status).toBe(StatusCodes.NO_CONTENT);
  });

  it("hides money without Financial and ignores rates sent", async () => {
    const ctx = await setup();
    const issued = await ctx.issued();
    actAs(await member(ctx, ["read", "create", "update"]));
    const list = await json<ListConstructionContractsWorkOrdersResponseModel>(
      await api.list(`projectId=${ctx.projectId}`),
    );
    expect(list.financial).toBe(false);
    expect(list.items[0]?.value).toBeNull();
    const seen = await ctx.read(issued.id);
    expect(seen.value).toBeNull();
    expect(seen.lines.map((line) => [line.rate, line.amount])).toEqual([
      [null, null],
      [null, null],
    ]);
    expect(seen.terms.mobilisationAdvance).toBeNull();
    const created = await ctx.created({
      lines: [
        { kind: "boq", boqItemId: ctx.itemB.id, quantity: "5", rate: 1 },
        {
          kind: "non_boq",
          description: "Labour",
          uomId: ctx.cum,
          quantity: "2",
          rate: 999_00,
        },
      ],
      terms: { mobilisationAdvance: 1_00_00 },
    });
    actAs(ctx.owner);
    const asOwner = await ctx.read(created.id);
    expect(asOwner.lines.map((line) => line.rate)).toEqual([300_00, 0]);
    expect(asOwner.terms.mobilisationAdvance).toBeNull();
  });

  it("defaults material coefficients from the BOQ item's library rate analysis", async () => {
    const ctx = await setup();
    const cement = await addMaterial(ctx.ws, ctx.by, {
      name: "Cement PPC (WO test)",
    });
    const libraryId = await addLibraryItem(ctx.ws, ctx.by, {
      code: "DSR-2.1",
      uomId: ctx.cum,
      adoptedRate: 5000_00n,
    });
    await addAnalysisMaterial(ctx.ws, {
      itemId: libraryId,
      materialId: cement.id,
      coefficient: "6.3",
    });
    const pcc = await ctx.addBoqItem("2.1", "20", 5200_00, {
      libraryItemId: libraryId,
    });
    const workOrder = await ctx.created({
      lines: [
        { kind: "boq", boqItemId: pcc.id },
        {
          kind: "non_boq",
          description: "Curing",
          uomId: ctx.cum,
          quantity: "1",
          rate: 0,
        },
      ],
      materials: [
        {
          materialId: cement.id,
          issueBasis: "at_cost",
          issueRate: 380_00,
          wastagePercent: "2",
          penalRate: 450_00,
        },
      ],
    });
    expect(workOrder.materials).toEqual([
      expect.objectContaining({
        materialId: cement.id,
        materialName: "Cement PPC (WO test)",
        issueBasis: "at_cost",
        issueRate: 380_00,
        wastagePercent: "2.00",
        penalRate: 450_00,
        coefficients: [
          { lineId: workOrder.lines[0]?.id, coefficient: "6.3000" },
        ],
      }),
    ]);
    const options =
      await json<ListConstructionContractsWorkOrderBoqItemsResponseModel>(
        await boqItemsRoute(
          request(
            `${BASE}/boq-items?projectId=${ctx.projectId}&workOrderId=${workOrder.id}`,
          ),
        ),
      );
    expect(options.items.find((item) => item.id === pcc.id)).toMatchObject({
      remaining: "20.0000",
      analysis: [{ materialId: cement.id, coefficient: "6.3000" }],
    });
    // An edit that leaves materials out keeps them; one that types a coefficient keeps it.
    const form = formOf(workOrder);
    const edited = await json<WorkOrder>(
      await api.update(workOrder.id, {
        ...form,
        materials: [
          {
            materialId: cement.id,
            issueBasis: "free",
            coefficients: [
              { line: 0, coefficient: "6" },
              { line: 1, coefficient: "0.5" },
            ],
          },
        ],
      }),
    );
    expect(edited.materials[0]?.coefficients).toEqual([
      { lineId: workOrder.lines[0]?.id, coefficient: "6.0000" },
      { lineId: workOrder.lines[1]?.id, coefficient: "0.5000" },
    ]);
    expect(edited.materials[0]?.issueRate).toBeNull();
    const stale = await api.update(workOrder.id, form);
    expect((await errorOf(stale)).code).toBe("WORK_ORDER_CHANGED");
  });

  it("deletes a draft, and keeps every Work Order inside its Company", async () => {
    const ctx = await setup();
    const draft = await ctx.created();
    const stranger = await newCompany();
    actAs({
      userId: stranger.ownerId,
      workspaceId: stranger.workspaceId,
      role: "owner",
    });
    for (const response of [
      await api.get(draft.id),
      await api.approve(draft.id),
      await api.pdf(draft.id),
    ]) {
      expect(response.status).toBe(StatusCodes.NOT_FOUND);
      expect((await errorOf(response)).code).toBe("WORK_ORDER_NOT_FOUND");
    }
    const list = await api.list(`projectId=${ctx.projectId}`);
    expect(list.status).toBe(StatusCodes.NOT_FOUND);
    actAs(await member(ctx, ["read"], false));
    expect((await api.list(`projectId=${ctx.projectId}`)).status).toBe(
      StatusCodes.FORBIDDEN,
    );
    actAs(ctx.owner);
    expect((await api.remove(draft.id)).status).toBe(StatusCodes.NO_CONTENT);
    expect((await api.get(draft.id)).status).toBe(StatusCodes.NOT_FOUND);
  });

  it("prints the Work Order as a PDF with Print", async () => {
    const ctx = await setup();
    const issued = await ctx.issued({ scope: "மண் வேலை — earthwork" });
    const response = await api.pdf(issued.id);
    expect(response.status).toBe(StatusCodes.OK);
    expect(response.headers.get("content-type")).toBe("application/pdf");
    expect(response.headers.get("content-disposition")).toContain(
      "Work-Order-WO-",
    );
    const bytes = new Uint8Array(await response.arrayBuffer());
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe("%PDF-");
    actAs(await member(ctx, ["read"]));
    expect((await api.pdf(issued.id)).status).toBe(StatusCodes.FORBIDDEN);
    actAs(await member(ctx, ["read", "print"]));
    const quantities = await api.pdf(issued.id);
    expect(quantities.status).toBe(StatusCodes.OK);
  });

  it("is on /api/docs with ConstructionContracts Work Order components", async () => {
    const spec = await json<{
      paths: Record<string, Record<string, unknown>>;
      components: { schemas: Record<string, unknown> };
    }>(getOpenApi());
    const base = "/api/construction/contracts/work-orders";
    expect(spec.paths[base]?.["get"]).toBeDefined();
    expect(spec.paths[base]?.["post"]).toBeDefined();
    for (const path of ["form-options", "boq-items", "material-options"])
      expect(spec.paths[`${base}/${path}`]?.["get"]).toBeDefined();
    expect(spec.paths[`${base}/{id}`]?.["get"]).toBeDefined();
    expect(spec.paths[`${base}/{id}/pdf`]?.["get"]).toBeDefined();
    for (const step of [
      "update",
      "delete",
      "submit",
      "approve",
      "reject",
      "amend",
      "close",
      "cancel",
    ])
      expect(spec.paths[`${base}/{id}/${step}`]?.["post"]).toBeDefined();
    expect(
      spec.components.schemas["GetConstructionContractsWorkOrderResponse"],
    ).toBeDefined();
  });
});
