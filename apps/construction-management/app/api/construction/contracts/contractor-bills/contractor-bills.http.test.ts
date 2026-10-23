import { prisma } from "@repo/construction-db";
import { StatusCodes } from "http-status-codes";
import { afterEach, describe, expect, it, vi } from "vitest";

import { POST as recordPayment } from "@/app/api/construction/finance/party-payments/route";
import { GET as getInvoiceRoute } from "@/app/api/construction/finance/invoices/[id]/route";
import { POST as deleteInvoiceRoute } from "@/app/api/construction/finance/invoices/[id]/delete/route";
import { POST as updateInvoiceRoute } from "@/app/api/construction/finance/invoices/[id]/update/route";
import type { ConstructionFinanceInvoiceResponse } from "@/app/api/construction/finance/invoices/invoice-models";
import { GET as getOpenApi } from "@/app/api/openapi.json/route";
import type { Flag } from "@/src/shared-kernel/access";
import { addDays } from "@/src/shared-kernel/calendar-date";
import { actAs, addMember, addProject, newCompany } from "@/test/companies";
import { measureWorkOrderLines } from "@/test/contracts";
import { seededAccounts } from "@/test/finance";
import {
  contractorTds,
  getFrom,
  idParams,
  partyBalance,
  postTo,
  TODAY,
} from "@/test/party-finance";
import { unitNamed } from "@/test/procurement";
import {
  sharedAssign,
  worksheetContractor,
  worksheetDepartment,
} from "@/test/site-work";

import { POST as approveWorkOrderRoute } from "../work-orders/[id]/approve/route";
import { GET as getWorkOrderRoute } from "../work-orders/[id]/route";
import { POST as submitWorkOrderRoute } from "../work-orders/[id]/submit/route";
import type { GetConstructionContractsWorkOrderResponseModel } from "../work-orders/work-order-models";
import { POST as createWorkOrderRoute } from "../work-orders/route";
import { POST as approveRoute } from "./[id]/approve/route";
import { POST as deleteRoute } from "./[id]/delete/route";
import { GET as pdfRoute } from "./[id]/pdf/route";
import { POST as refreshRoute } from "./[id]/refresh/route";
import { POST as rejectRoute } from "./[id]/reject/route";
import { POST as reverseRoute } from "./[id]/reverse/route";
import { GET as getRoute } from "./[id]/route";
import { POST as submitRoute } from "./[id]/submit/route";
import { GET as suggestionsRoute } from "./[id]/suggestions/route";
import { POST as updateRoute } from "./[id]/update/route";
import type {
  ConstructionContractsContractorBillFormOptionsResponseModel,
  ConstructionContractsContractorBillSuggestionsResponseModel,
  GetConstructionContractsContractorBillResponseModel,
  ListConstructionContractsContractorBillsResponseModel,
} from "./contractor-bill-models";
import { GET as formOptionsRoute } from "./form-options/route";
import { GET as listRoute, POST as createRoute } from "./route";

vi.mock(import("@repo/auth/construction/server"), async (importOriginal) => ({
  ...(await importOriginal()),
  getCompanyAuthFromHeaders: vi.fn(),
}));

afterEach(() => {
  vi.restoreAllMocks();
});

const BASE = "http://localhost/api/construction/contracts/contractor-bills";
const WORK_ORDERS = "http://localhost/api/construction/contracts/work-orders";

type Bill = GetConstructionContractsContractorBillResponseModel;
type WorkOrder = GetConstructionContractsWorkOrderResponseModel;
type Invoice = ConstructionFinanceInvoiceResponse;

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
  formOptions: (projectId: string) =>
    formOptionsRoute(request(`${BASE}/form-options?projectId=${projectId}`)),
  get: (id: string) => getRoute(request(`${BASE}/${id}`), params(id)),
  suggestions: (id: string) =>
    suggestionsRoute(request(`${BASE}/${id}/suggestions`), params(id)),
  update: (id: string, body: Record<string, unknown>) =>
    updateRoute(request(`${BASE}/${id}/update`, body), params(id)),
  refresh: (id: string, body: Record<string, unknown> = {}) =>
    refreshRoute(request(`${BASE}/${id}/refresh`, body), params(id)),
  remove: (id: string) =>
    deleteRoute(request(`${BASE}/${id}/delete`, {}), params(id)),
  submit: (id: string) =>
    submitRoute(request(`${BASE}/${id}/submit`, {}), params(id)),
  approve: (id: string, body: Record<string, unknown> = {}) =>
    approveRoute(request(`${BASE}/${id}/approve`, body), params(id)),
  reject: (id: string, reason: string) =>
    rejectRoute(request(`${BASE}/${id}/reject`, { reason }), params(id)),
  reverse: (id: string, reason: string) =>
    reverseRoute(request(`${BASE}/${id}/reverse`, { reason }), params(id)),
  pdf: (id: string) => pdfRoute(request(`${BASE}/${id}/pdf`), params(id)),
};

const day = (offset: number) => addDays(TODAY, offset);

async function setup(
  options: {
    contractorState?: string;
    terms?: Record<string, unknown>;
  } = {},
) {
  const company = await newCompany();
  const ws = company.workspaceId;
  const by = company.ownerId;
  const owner = { userId: by, workspaceId: ws, role: "owner" as const };
  const projectId = await addProject(ws, by, "Metro Depot");
  await prisma.constructionProjectsProject.update({
    where: { id: projectId },
    data: { stateCode: "33" },
  });
  const cum = await unitNamed(ws, by, "cum");
  const departmentId = await worksheetDepartment(ws, by, { name: "Masonry" });
  const contractorId = await worksheetContractor(ws, by, {
    projectIds: [projectId],
    departmentIds: [departmentId],
    name: "Velan Constructions",
  });
  await prisma.constructionMastersContractor.update({
    where: { id: contractorId },
    data: { stateCode: options.contractorState ?? "33" },
  });
  await contractorTds(contractorId, { pan: "ABCPK1234F", tdsApplicable: true });
  const accounts = await seededAccounts(ws);
  actAs(owner);

  /** An issued Work Order: Excavation 100 cum at ₹400, Masonry 50 cum at ₹300. */
  const issued = async (terms: Record<string, unknown> = {}) => {
    const created = await createWorkOrderRoute(
      request(WORK_ORDERS, {
        projectId,
        contractorId,
        departmentId,
        orderDate: day(-60),
        lines: [
          {
            kind: "non_boq",
            itemNo: "1",
            description: "Excavation",
            uomId: cum,
            quantity: "100",
            rate: 400_00,
          },
          {
            kind: "non_boq",
            itemNo: "2",
            description: "Masonry",
            uomId: cum,
            quantity: "50",
            rate: 300_00,
          },
        ],
        terms: {
          retentionPercent: "5",
          sacCode: "9954",
          gstRate: "18",
          ...options.terms,
          ...terms,
        },
      }),
    );
    expect(created.status, JSON.stringify(await created.clone().json())).toBe(
      StatusCodes.CREATED,
    );
    const draft = await json<WorkOrder>(created);
    expect(
      (
        await submitWorkOrderRoute(
          request(`${WORK_ORDERS}/${draft.id}/submit`, {}),
          params(draft.id),
        )
      ).status,
    ).toBe(StatusCodes.OK);
    const approved = await approveWorkOrderRoute(
      request(`${WORK_ORDERS}/${draft.id}/approve`, {}),
      params(draft.id),
    );
    expect(approved.status).toBe(StatusCodes.OK);
    const workOrder = await json<WorkOrder>(approved);
    const [excavation, masonry] = workOrder.lines;
    if (excavation == null || masonry == null) throw new Error("No lines");
    return { workOrder, excavation: excavation.id, masonry: masonry.id };
  };

  const measure = (
    workOrderId: string,
    measuredOn: string,
    rows: { workOrderLineId: string; quantity: string }[],
    status: "draft" | "submitted" | "checked" = "checked",
  ) =>
    measureWorkOrderLines(ws, by, {
      projectId,
      workOrderId,
      measuredOn,
      status,
      rows,
    });

  const draft = async (
    workOrderId: string,
    extra: Record<string, unknown> = {},
  ) => {
    const response = await api.create({
      projectId,
      workOrderId,
      billDate: TODAY,
      measuredUpTo: day(-1),
      ...extra,
    });
    expect(response.status, JSON.stringify(await response.clone().json())).toBe(
      StatusCodes.CREATED,
    );
    return json<Bill>(response);
  };

  const read = async (id: string) => json<Bill>(await api.get(id));

  /** Drafted, submitted and approved. */
  const approved = async (
    workOrderId: string,
    extra: Record<string, unknown> = {},
  ) => {
    const bill = await draft(workOrderId, extra);
    const submitted = await api.submit(bill.id);
    expect(
      submitted.status,
      JSON.stringify(await submitted.clone().json()),
    ).toBe(StatusCodes.OK);
    const response = await api.approve(bill.id, { confirmUnbilled: true });
    expect(response.status, JSON.stringify(await response.clone().json())).toBe(
      StatusCodes.OK,
    );
    return json<Bill>(response);
  };

  const rowsBilledTo = async (rowIds: readonly string[]) =>
    (
      await prisma.constructionContractsMeasurementRow.findMany({
        where: { id: { in: [...rowIds] } },
        orderBy: { position: "asc" },
        select: { billId: true },
      })
    ).map((row) => row.billId);

  const invoiceOf = async (id: string) =>
    json<Invoice>(
      await getInvoiceRoute(getFrom(`/invoices/${id}`), idParams(id)),
    );

  return {
    ws,
    by,
    owner,
    projectId,
    cum,
    contractorId,
    ...accounts,
    issued,
    measure,
    draft,
    read,
    approved,
    rowsBilledTo,
    invoiceOf,
  };
}

type Ctx = Awaited<ReturnType<typeof setup>>;

async function member(ctx: Ctx, flags: Flag[]) {
  const added = await addMember(ctx.ws, ctx.by, {
    "contracts.contractor_bills": flags,
  });
  await sharedAssign(added.memberId, ctx.projectId);
  return { userId: added.userId, workspaceId: ctx.ws, role: "member" as const };
}

describe("Contractor Bills (CM-1106)", () => {
  it("drafts from checked rows up to the date that no bill has taken", async () => {
    const ctx = await setup();
    const { workOrder, excavation, masonry } = await ctx.issued();
    const taken = await ctx.measure(workOrder.id, day(-10), [
      { workOrderLineId: excavation, quantity: "10" },
      { workOrderLineId: masonry, quantity: "5" },
    ]);
    const later = await ctx.measure(workOrder.id, day(0), [
      { workOrderLineId: excavation, quantity: "2" },
    ]);
    const submitted = await ctx.measure(
      workOrder.id,
      day(-10),
      [{ workOrderLineId: excavation, quantity: "3" }],
      "submitted",
    );

    const options =
      await json<ConstructionContractsContractorBillFormOptionsResponseModel>(
        await api.formOptions(ctx.projectId),
      );
    expect(options.workOrders).toEqual([
      expect.objectContaining({
        id: workOrder.id,
        contractorName: "Velan Constructions",
        openBillId: null,
        unbilled: [
          { measuredOn: day(-10), rows: 2 },
          { measuredOn: day(0), rows: 1 },
        ],
      }),
    ]);

    const bill = await ctx.draft(workOrder.id);
    expect(bill).toMatchObject({
      status: "draft",
      number: null,
      ordinal: null,
      contractorName: "Velan Constructions",
      departmentName: "Masonry",
      workOrderNumber: workOrder.number,
      billDate: TODAY,
      measuredUpTo: day(-1),
      // 10 × ₹400 + 5 × ₹300
      gross: 5_500_00,
      cumulativeValue: 5_500_00,
      previousValue: 0,
      sacCode: "9954",
      gstRate: "18.00",
      supplyType: "intra_state",
      placeOfSupplyStateCode: "33",
      cgst: 495_00,
      sgst: 495_00,
      igst: 0,
      gst: 990_00,
      payableGst: 990_00,
      // The suggested retention: 5 % of the gross.
      deductions: 275_00,
      deductionLines: [
        { kind: "retention", amount: 275_00, description: null },
      ],
      net: 5_500_00 + 990_00 - 275_00,
      retention: { percent: "5.00", suggested: 275_00, heldBefore: 0 },
    });
    expect(bill.lines).toMatchObject([
      {
        workOrderLineId: excavation,
        itemNo: "1",
        uomName: "cum",
        rate: 400_00,
        previousQuantity: "0.0000",
        quantity: "10.0000",
        cumulativeQuantity: "10.0000",
        workOrderQuantity: "100.0000",
        amount: 4_000_00,
        rows: [{ measuredOn: day(-10), quantity: "10.0000", direct: true }],
      },
      { workOrderLineId: masonry, quantity: "5.0000", amount: 1_500_00 },
    ]);
    expect(bill.tdsEstimate).toMatchObject({
      label: expect.stringContaining("194C") as unknown,
      applicable: true,
      base: 5_500_00,
    });
    expect(await ctx.rowsBilledTo(taken.rowIds)).toEqual([bill.id, bill.id]);
    expect(await ctx.rowsBilledTo(later.rowIds)).toEqual([null]);
    expect(await ctx.rowsBilledTo(submitted.rowIds)).toEqual([null]);

    // One open bill per Work Order, from the partial unique index.
    await ctx.measure(workOrder.id, day(-5), [
      { workOrderLineId: excavation, quantity: "1" },
    ]);
    const second = await api.create({
      projectId: ctx.projectId,
      workOrderId: workOrder.id,
      billDate: TODAY,
      measuredUpTo: day(-1),
    });
    expect(second.status).toBe(StatusCodes.CONFLICT);
    expect((await errorOf(second)).code).toBe("BILL_OPEN_EXISTS");

    const listed =
      await json<ListConstructionContractsContractorBillsResponseModel>(
        await api.list(`projectId=${ctx.projectId}`),
      );
    expect(listed).toMatchObject({
      total: 1,
      totals: { count: 1, gross: 5_500_00, net: 6_215_00 },
      retentionHeld: [],
      financial: true,
    });

    // Nothing waiting: 400.
    const { workOrder: idle } = await ctx.issued();
    const none = await api.create({
      projectId: ctx.projectId,
      workOrderId: idle.id,
      billDate: TODAY,
      measuredUpTo: day(-1),
    });
    expect(none.status).toBe(StatusCodes.BAD_REQUEST);
    expect((await errorOf(none)).code).toBe("BILL_NO_MEASUREMENTS");
  });

  it("refreshes a draft with rows checked since, or up to a new date", async () => {
    const ctx = await setup();
    const { workOrder, excavation, masonry } = await ctx.issued();
    await ctx.measure(workOrder.id, day(-10), [
      { workOrderLineId: excavation, quantity: "10" },
      { workOrderLineId: masonry, quantity: "5" },
    ]);
    const bill = await ctx.draft(workOrder.id, { measuredUpTo: day(-5) });
    await ctx.measure(workOrder.id, day(-8), [
      { workOrderLineId: masonry, quantity: "2" },
    ]);
    const tomorrowish = await ctx.measure(workOrder.id, day(-2), [
      { workOrderLineId: excavation, quantity: "2" },
    ]);

    const refreshed = await json<Bill>(
      await api.refresh(bill.id, { expectedUpdatedAt: bill.updatedAt }),
    );
    expect(refreshed.lines.map((line) => line.quantity)).toEqual([
      "10.0000",
      "7.0000",
    ]);
    expect(await ctx.rowsBilledTo(tomorrowish.rowIds)).toEqual([null]);

    const later = await json<Bill>(
      await api.refresh(bill.id, { measuredUpTo: day(-1) }),
    );
    expect(later.measuredUpTo).toBe(day(-1));
    expect(later.lines.map((line) => line.quantity)).toEqual([
      "12.0000",
      "7.0000",
    ]);
    // 12 × ₹400 + 7 × ₹300 = ₹6,900; retention left as suggested follows.
    expect(later).toMatchObject({
      gross: 6_900_00,
      deductionLines: [{ kind: "retention", amount: 345_00 }],
    });
    expect(await ctx.rowsBilledTo(tomorrowish.rowIds)).toEqual([bill.id]);

    // Typed deductions; retention never above the suggestion.
    const over = await api.update(bill.id, {
      billDate: TODAY,
      measuredUpTo: day(-1),
      deductions: [{ kind: "retention", amount: 345_01 }],
      expectedUpdatedAt: later.updatedAt,
    });
    expect(over.status).toBe(StatusCodes.BAD_REQUEST);
    expect(await errorOf(over)).toMatchObject({
      code: "BILL_RETENTION_OVER_CAP",
      details: { max: 345_00 },
    });
    const saved = await json<Bill>(
      await api.update(bill.id, {
        billDate: TODAY,
        measuredUpTo: day(-1),
        remarks: "First RA",
        deductions: [
          { kind: "retention", amount: 300_00 },
          { kind: "material_at_cost", amount: 1_000_00 },
          { kind: "other", amount: 50_00, description: "Water" },
        ],
        expectedUpdatedAt: later.updatedAt,
      }),
    );
    expect(saved).toMatchObject({
      remarks: "First RA",
      deductions: 1_350_00,
      net: 6_900_00 + 1_242_00 - 1_350_00,
    });
    const stale = await api.update(bill.id, {
      billDate: TODAY,
      measuredUpTo: day(-1),
      expectedUpdatedAt: later.updatedAt,
    });
    expect(stale.status).toBe(StatusCodes.CONFLICT);
    expect((await errorOf(stale)).code).toBe("BILL_CHANGED");

    const suggestions =
      await json<ConstructionContractsContractorBillSuggestionsResponseModel>(
        await api.suggestions(bill.id),
      );
    expect(suggestions).toEqual({
      retention: expect.objectContaining({ suggested: 345_00 }) as unknown,
      mobilisationRecovery: null,
      // No advance on the Work Order: nothing to recover (CM-1108).
      recoveries: [],
      // No material issued under it: nothing to reconcile (CM-1110).
      materials: [],
    });

    // Delete frees the rows.
    expect((await api.remove(bill.id)).status).toBe(StatusCodes.NO_CONTENT);
    expect(await ctx.rowsBilledTo(tomorrowish.rowIds)).toEqual([null]);
    expect((await api.get(bill.id)).status).toBe(StatusCodes.NOT_FOUND);
  });

  it("refuses more than the Work Order holds on draft and on approve", async () => {
    const ctx = await setup();
    const { workOrder, excavation, masonry } = await ctx.issued();
    const over = await ctx.measure(workOrder.id, day(-10), [
      { workOrderLineId: masonry, quantity: "51" },
    ]);
    const refused = await api.create({
      projectId: ctx.projectId,
      workOrderId: workOrder.id,
      billDate: TODAY,
      measuredUpTo: day(-1),
    });
    expect(refused.status).toBe(StatusCodes.CONFLICT);
    expect(await errorOf(refused)).toMatchObject({
      code: "WORK_ORDER_QUANTITY_EXCEEDED",
      details: {
        lineId: masonry,
        cumulative: "51.0000",
        workOrderQuantity: "50.0000",
      },
    });
    expect(await ctx.rowsBilledTo(over.rowIds)).toEqual([null]);
    await prisma.constructionContractsMeasurementSheet.update({
      where: { id: over.sheetId },
      data: { deletedAt: new Date(), deletedBy: ctx.by },
    });

    await ctx.measure(workOrder.id, day(-10), [
      { workOrderLineId: excavation, quantity: "40" },
    ]);
    const bill = await ctx.draft(workOrder.id);
    expect((await api.submit(bill.id)).status).toBe(StatusCodes.OK);
    // The Work Order is cut below the bill while it waits.
    await prisma.constructionContractsWorkOrderLine.update({
      where: { id: excavation },
      data: { quantity: "30" },
    });
    const approve = await api.approve(bill.id);
    expect(approve.status).toBe(StatusCodes.CONFLICT);
    expect(await errorOf(approve)).toMatchObject({
      code: "WORK_ORDER_QUANTITY_EXCEEDED",
      details: { lineId: excavation, workOrderQuantity: "30.0000" },
    });
  });

  it("approves into one ra_bill invoice, the ledger entry and retention held; finance cannot edit it", async () => {
    const ctx = await setup();
    const { workOrder, excavation, masonry } = await ctx.issued({
      retentionCapPercent: "1",
    });
    const rows = await ctx.measure(workOrder.id, day(-10), [
      { workOrderLineId: excavation, quantity: "10" },
      { workOrderLineId: masonry, quantity: "5" },
    ]);
    const balanceBefore = await partyBalance(
      ctx.ws,
      "contractor",
      ctx.contractorId,
      ctx.projectId,
    );
    const bill = await ctx.draft(workOrder.id);
    // Cap 1 % of ₹55,000 = ₹550; 5 % of ₹5,500 = ₹275 fits.
    expect(bill.retention).toMatchObject({ cap: 550_00, suggested: 275_00 });
    const submitted = await json<Bill>(await api.submit(bill.id));
    expect(submitted.status).toBe("pending_approval");
    expect(submitted.number).toMatch(/^CB\//);
    expect(submitted.ordinal).toBe(1);

    const approved = await json<Bill>(await api.approve(bill.id));
    expect(approved).toMatchObject({
      status: "approved",
      net: 6_215_00,
      retentionHeldOnWorkOrder: 275_00,
    });
    expect(approved.invoiceId).not.toBeNull();
    const invoices = await prisma.constructionFinanceInvoice.findMany({
      where: { workspaceId: ctx.ws, sourceId: bill.id },
    });
    expect(invoices).toHaveLength(1);
    const invoice = await ctx.invoiceOf(approved.invoiceId ?? "");
    expect(invoice).toMatchObject({
      id: approved.invoiceId,
      origin: "ra_bill",
      sourceId: bill.id,
      party: { type: "contractor", id: ctx.contractorId },
      direction: "payable",
      invoiceNumber: submitted.number,
      invoiceDate: TODAY,
      dueDate: null,
      taxableAmount: 5_500_00,
      gstAmount: 990_00,
      amount: 6_215_00,
      balance: 6_215_00,
      actions: { edit: false, delete: false },
    });
    const entries = await prisma.constructionFinancePartyEntry.findMany({
      where: { workspaceId: ctx.ws, invoiceId: approved.invoiceId },
    });
    expect(entries).toEqual([
      expect.objectContaining({ kind: "invoice", amount: 6_215_00n }),
    ]);
    expect(
      await partyBalance(ctx.ws, "contractor", ctx.contractorId, ctx.projectId),
    ).toBe(balanceBefore + 6_215_00n);
    expect(await ctx.rowsBilledTo(rows.rowIds)).toEqual([bill.id, bill.id]);

    // Retention held on the list, per Contractor.
    const listed =
      await json<ListConstructionContractsContractorBillsResponseModel>(
        await api.list(`projectId=${ctx.projectId}&status=approved`),
      );
    expect(listed.retentionHeld).toEqual([
      {
        contractorId: ctx.contractorId,
        contractorName: "Velan Constructions",
        amount: 275_00,
      },
    ]);

    // Finance refuses to edit or delete an ra_bill invoice.
    const edit = await updateInvoiceRoute(
      postTo(`/invoices/${invoice.id}/update`, {
        invoiceNumber: invoice.invoiceNumber,
        invoiceDate: invoice.invoiceDate,
        amount: 1_00,
        remarks: "Changed",
        expectedUpdatedAt: invoice.updatedAt,
      }),
      idParams(invoice.id),
    );
    expect(edit.status).toBe(StatusCodes.CONFLICT);
    expect((await errorOf(edit)).code).toBe("INVOICE_FROM_CONTRACTOR_BILL");
    const remove = await deleteInvoiceRoute(
      postTo(`/invoices/${invoice.id}/delete`, {
        expectedUpdatedAt: invoice.updatedAt,
      }),
      idParams(invoice.id),
    );
    expect(remove.status).toBe(StatusCodes.CONFLICT);
    expect((await errorOf(remove)).code).toBe("INVOICE_FROM_CONTRACTOR_BILL");

    // The second bill bills from the first's quantities.
    await ctx.measure(workOrder.id, day(-3), [
      { workOrderLineId: excavation, quantity: "5" },
    ]);
    const second = await ctx.approved(workOrder.id);
    expect(second).toMatchObject({ ordinal: 2, previousValue: 4_000_00 });
    expect(second.lines).toMatchObject([
      {
        workOrderLineId: excavation,
        previousQuantity: "10.0000",
        quantity: "5.0000",
        cumulativeQuantity: "15.0000",
        amount: 2_000_00,
      },
    ]);
    // Cap ₹550 − ₹275 held leaves ₹275; 5 % of ₹2,000 is ₹100.
    expect(second.retention).toMatchObject({
      heldBefore: 275_00,
      suggested: 100_00,
    });
    expect(second.retentionHeldOnWorkOrder).toBe(375_00);

    // The Work Order shows what is billed.
    const wo = await json<WorkOrder>(
      await getWorkOrderRoute(
        request(`${WORK_ORDERS}/${workOrder.id}`),
        params(workOrder.id),
      ),
    );
    expect(wo.lines.map((line) => line.billed)).toEqual(["15.0000", "5.0000"]);
  });

  it("reverses only the latest unsettled bill, reversing its invoice and freeing its rows", async () => {
    const ctx = await setup();
    const { workOrder, excavation } = await ctx.issued();
    await ctx.measure(workOrder.id, day(-10), [
      { workOrderLineId: excavation, quantity: "10" },
    ]);
    const first = await ctx.approved(workOrder.id, { measuredUpTo: day(-9) });
    const secondRows = await ctx.measure(workOrder.id, day(-3), [
      { workOrderLineId: excavation, quantity: "5" },
    ]);
    const second = await ctx.approved(workOrder.id);

    const notLatest = await api.reverse(first.id, "Wrong rates");
    expect(notLatest.status).toBe(StatusCodes.CONFLICT);
    expect((await errorOf(notLatest)).code).toBe("BILL_NOT_LATEST");

    const missing = await api.reverse(second.id, " ");
    expect(missing.status).toBe(StatusCodes.BAD_REQUEST);
    expect((await errorOf(missing)).code).toBe("REVERSE_REASON_REQUIRED");

    const before = await partyBalance(
      ctx.ws,
      "contractor",
      ctx.contractorId,
      ctx.projectId,
    );
    const reversed = await json<Bill>(
      await api.reverse(second.id, "Measured twice"),
    );
    expect(reversed).toMatchObject({
      status: "reversed",
      reverseReason: "Measured twice",
    });
    expect(await ctx.rowsBilledTo(secondRows.rowIds)).toEqual([null]);
    const invoice = await prisma.constructionFinanceInvoice.findFirst({
      where: { id: second.invoiceId ?? "" },
    });
    expect(invoice?.deletedAt).not.toBeNull();
    const entries = await prisma.constructionFinancePartyEntry.findMany({
      where: { workspaceId: ctx.ws, invoiceId: second.invoiceId },
    });
    expect(entries.map((entry) => entry.amount).sort()).toEqual(
      [-BigInt(second.net ?? 0), BigInt(second.net ?? 0)].sort(),
    );
    expect(
      await partyBalance(ctx.ws, "contractor", ctx.contractorId, ctx.projectId),
    ).toBe(before - BigInt(second.net ?? 0));

    // A payment against the first bill's invoice settles it.
    const paid = await recordPayment(
      postTo("/party-payments", {
        partyType: "contractor",
        partyId: ctx.contractorId,
        projectId: ctx.projectId,
        paymentDate: TODAY,
        accountId: ctx.cashId,
        mode: "cash",
        amount: 1_000_00,
        allocations: [{ invoiceId: first.invoiceId, amount: 1_000_00 }],
      }),
    );
    expect(paid.status, JSON.stringify(await paid.clone().json())).toBe(
      StatusCodes.CREATED,
    );
    const settled = await api.reverse(first.id, "Wrong rates");
    expect(settled.status).toBe(StatusCodes.CONFLICT);
    expect((await errorOf(settled)).code).toBe("BILL_SETTLED");
  });

  it("rejects with a reason and frees the rows; the bill stays as a record", async () => {
    const ctx = await setup();
    const { workOrder, excavation } = await ctx.issued();
    const rows = await ctx.measure(workOrder.id, day(-10), [
      { workOrderLineId: excavation, quantity: "10" },
    ]);
    const bill = await ctx.draft(workOrder.id);
    const submitted = await json<Bill>(await api.submit(bill.id));
    const noReason = await api.reject(bill.id, "");
    expect(noReason.status).toBe(StatusCodes.BAD_REQUEST);
    expect((await errorOf(noReason)).code).toBe("REJECTION_REASON_REQUIRED");
    const rejected = await json<Bill>(
      await api.reject(bill.id, "Joint measurement disputed"),
    );
    expect(rejected).toMatchObject({
      status: "rejected",
      number: submitted.number,
      rejectReason: "Joint measurement disputed",
    });
    expect(await ctx.rowsBilledTo(rows.rowIds)).toEqual([null]);
    const again = await api.reject(bill.id, "Twice");
    expect(again.status).toBe(StatusCodes.CONFLICT);
    expect((await errorOf(again)).code).toBe("BILL_NOT_PENDING");
    // The next bill takes the freed rows, and is RA 1 again.
    const next = await ctx.draft(workOrder.id);
    expect(await ctx.rowsBilledTo(rows.rowIds)).toEqual([next.id]);
    expect((await json<Bill>(await api.submit(next.id))).ordinal).toBe(1);
  });

  it("closes the Work Order with a Final bill, confirmed when lines are short, and reopens it on reversal", async () => {
    const ctx = await setup();
    const { workOrder, excavation, masonry } = await ctx.issued();
    await ctx.measure(workOrder.id, day(-10), [
      { workOrderLineId: excavation, quantity: "100" },
      { workOrderLineId: masonry, quantity: "45" },
    ]);
    const bill = await ctx.draft(workOrder.id, { isFinal: true });
    expect((await api.submit(bill.id)).status).toBe(StatusCodes.OK);
    const short = await api.approve(bill.id);
    expect(short.status).toBe(StatusCodes.CONFLICT);
    expect(await errorOf(short)).toMatchObject({
      code: "BILL_FINAL_UNBILLED",
      details: {
        lines: [
          {
            lineId: masonry,
            itemNo: "2",
            billed: "45.0000",
            workOrderQuantity: "50.0000",
          },
        ],
      },
    });
    const approved = await json<Bill>(
      await api.approve(bill.id, { confirmUnbilled: true }),
    );
    expect(approved).toMatchObject({ status: "approved", isFinal: true });
    const closed =
      await prisma.constructionContractsWorkOrder.findUniqueOrThrow({
        where: { id: workOrder.id },
      });
    expect(closed.status).toBe("closed");
    expect(closed.closedOn?.toISOString().slice(0, 10)).toBe(TODAY);
    expect(closed.closeReason).toContain(approved.number ?? "?");

    await api.reverse(bill.id, "Not final after all");
    const reopened =
      await prisma.constructionContractsWorkOrder.findUniqueOrThrow({
        where: { id: workOrder.id },
      });
    expect(reopened).toMatchObject({
      status: "issued",
      closedOn: null,
      closeReason: null,
      completedOn: null,
    });
  });

  it("charges IGST across states and keeps reverse-charge GST out of the net", async () => {
    const igst = await setup({ contractorState: "29" });
    const one = await igst.issued();
    await igst.measure(one.workOrder.id, day(-10), [
      { workOrderLineId: one.excavation, quantity: "10" },
    ]);
    expect(await igst.draft(one.workOrder.id)).toMatchObject({
      supplyType: "inter_state",
      cgst: 0,
      sgst: 0,
      igst: 720_00,
    });

    const rcm = await setup({ terms: { reverseCharge: true } });
    const two = await rcm.issued();
    await rcm.measure(two.workOrder.id, day(-10), [
      { workOrderLineId: two.excavation, quantity: "10" },
    ]);
    const bill = await rcm.approved(two.workOrder.id);
    expect(bill).toMatchObject({
      reverseCharge: true,
      gst: 720_00,
      payableGst: 0,
      // ₹4,000 − 5 % retention; no GST paid to the Contractor.
      net: 3_800_00,
    });
    expect(await rcm.invoiceOf(bill.invoiceId ?? "")).toMatchObject({
      taxableAmount: 4_000_00,
      gstAmount: 0,
      amount: 3_800_00,
    });
  });

  it("needs the Approve and Reject flags, and nulls money without Financial", async () => {
    const ctx = await setup();
    const { workOrder, excavation } = await ctx.issued();
    await ctx.measure(workOrder.id, day(-10), [
      { workOrderLineId: excavation, quantity: "10" },
    ]);
    const bill = await ctx.draft(workOrder.id);
    expect((await api.submit(bill.id)).status).toBe(StatusCodes.OK);

    actAs(await member(ctx, ["read", "create", "update", "print"]));
    expect((await api.approve(bill.id)).status).toBe(StatusCodes.FORBIDDEN);
    expect((await api.reject(bill.id, "No")).status).toBe(
      StatusCodes.FORBIDDEN,
    );
    const seen = await ctx.read(bill.id);
    expect(seen).toMatchObject({
      financial: false,
      gross: null,
      net: null,
      cgst: null,
      tdsEstimate: null,
      retention: { suggested: null },
      allowed: { approve: false, reject: false, print: true },
    });
    expect(seen.lines[0]).toMatchObject({
      quantity: "10.0000",
      rate: null,
      amount: null,
    });
    expect(seen.deductionLines[0]?.amount).toBeNull();
    const listed =
      await json<ListConstructionContractsContractorBillsResponseModel>(
        await api.list(`projectId=${ctx.projectId}`),
      );
    expect(listed.totals).toMatchObject({ count: 1, gross: null, net: null });
    const pdf = await api.pdf(bill.id);
    expect(pdf.status).toBe(StatusCodes.OK);
    expect(pdf.headers.get("content-type")).toBe("application/pdf");

    actAs(ctx.owner);
    const owned = await api.pdf(bill.id);
    expect(owned.headers.get("content-type")).toBe("application/pdf");
    expect((await owned.arrayBuffer()).byteLength).toBeGreaterThan(1000);
  });

  it("keeps another Company's bills apart, and lists the routes in the OpenAPI document", async () => {
    const ctx = await setup();
    const { workOrder, excavation } = await ctx.issued();
    await ctx.measure(workOrder.id, day(-10), [
      { workOrderLineId: excavation, quantity: "10" },
    ]);
    const bill = await ctx.draft(workOrder.id);

    const other = await newCompany("Other Builders");
    actAs({
      userId: other.ownerId,
      workspaceId: other.workspaceId,
      role: "owner",
    });
    const response = await api.get(bill.id);
    expect(response.status).toBe(StatusCodes.NOT_FOUND);
    expect((await errorOf(response)).code).toBe("BILL_NOT_FOUND");
    expect((await api.approve(bill.id)).status).toBe(StatusCodes.NOT_FOUND);

    const document = await json<{ paths: Record<string, unknown> }>(
      getOpenApi(),
    );
    expect(Object.keys(document.paths)).toEqual(
      expect.arrayContaining([
        "/api/construction/contracts/contractor-bills",
        "/api/construction/contracts/contractor-bills/{id}/approve",
        "/api/construction/contracts/contractor-bills/{id}/reverse",
        "/api/construction/contracts/contractor-bills/{id}/pdf",
      ]),
    );
  });
});
