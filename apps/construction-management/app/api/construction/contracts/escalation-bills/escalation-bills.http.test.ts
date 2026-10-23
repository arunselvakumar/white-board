import { prisma } from "@repo/construction-db";
import { StatusCodes } from "http-status-codes";
import { afterEach, describe, expect, it, vi } from "vitest";

import { GET as getInvoiceRoute } from "@/app/api/construction/finance/invoices/[id]/route";
import type { ConstructionFinanceInvoiceResponse } from "@/app/api/construction/finance/invoices/invoice-models";
import { GET as getOpenApi } from "@/app/api/openapi.json/route";
import { addDays } from "@/src/shared-kernel/calendar-date";
import { actAs, addMember, addProject, newCompany } from "@/test/companies";
import {
  addClient,
  addRunningBill,
  measureWorkOrderLines,
} from "@/test/contracts";
import { getFrom, idParams, TODAY } from "@/test/party-finance";
import { addBillingAddress, unitNamed } from "@/test/procurement";
import {
  sharedAssign,
  worksheetContractor,
  worksheetDepartment,
} from "@/test/site-work";

import { POST as updateContractRoute } from "../client-bills/contract/update/route";
import { GET as clientClauseRoute } from "../client-bills/contract/escalation-clause/route";
import { POST as reverseRunningRoute } from "../contractor-bills/[id]/reverse/route";
import { GET as getRunningRoute } from "../contractor-bills/[id]/route";
import { POST as updateRunningRoute } from "../contractor-bills/[id]/update/route";
import type { GetConstructionContractsContractorBillResponseModel } from "../contractor-bills/contractor-bill-models";
import {
  GET as listRunningRoute,
  POST as createRunningRoute,
} from "../contractor-bills/route";
import { POST as deleteClauseRoute } from "../escalation-clauses/[id]/delete/route";
import { POST as updateClauseRoute } from "../escalation-clauses/[id]/update/route";
import type { ConstructionContractsEscalationClauseResponseModel } from "../escalation-clauses/escalation-clause-models";
import { POST as createClauseRoute } from "../escalation-clauses/route";
import { POST as createIndexRoute } from "../price-indices/route";
import { POST as approveWorkOrderRoute } from "../work-orders/[id]/approve/route";
import { GET as workOrderClauseRoute } from "../work-orders/[id]/escalation-clause/route";
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
import { POST as updateRoute } from "./[id]/update/route";
import type {
  ConstructionContractsEscalationFormOptionsResponseModel,
  GetConstructionContractsEscalationBillResponseModel,
  PreviewConstructionContractsEscalationBillResponseModel,
} from "./escalation-bill-models";
import { GET as formOptionsRoute } from "./form-options/route";
import { GET as previewRoute } from "./preview/route";
import { POST as createRoute } from "./route";

vi.mock(import("@repo/auth/construction/server"), async (importOriginal) => ({
  ...(await importOriginal()),
  getCompanyAuthFromHeaders: vi.fn(),
}));

afterEach(() => {
  vi.restoreAllMocks();
});

const HOST = "http://localhost/api/construction/contracts";
const BASE = `${HOST}/escalation-bills`;

type Bill = GetConstructionContractsEscalationBillResponseModel;
type Clause = ConstructionContractsEscalationClauseResponseModel;
type RunningBill = GetConstructionContractsContractorBillResponseModel;
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
const day = (offset: number) => addDays(TODAY, offset);
/** Rupees to paise as a JSON number. */
const rs = (value: number) => Math.round(value * 100);

const api = {
  create: (body: Record<string, unknown>) => createRoute(request(BASE, body)),
  preview: (query: string) => previewRoute(request(`${BASE}/preview?${query}`)),
  formOptions: (query: string) =>
    formOptionsRoute(request(`${BASE}/form-options?${query}`)),
  get: (id: string) => getRoute(request(`${BASE}/${id}`), params(id)),
  update: (id: string, body: Record<string, unknown>) =>
    updateRoute(request(`${BASE}/${id}/update`, body), params(id)),
  refresh: (id: string) =>
    refreshRoute(request(`${BASE}/${id}/refresh`, {}), params(id)),
  remove: (id: string) =>
    deleteRoute(request(`${BASE}/${id}/delete`, {}), params(id)),
  submit: (id: string) =>
    submitRoute(request(`${BASE}/${id}/submit`, {}), params(id)),
  approve: (id: string) =>
    approveRoute(request(`${BASE}/${id}/approve`, {}), params(id)),
  reject: (id: string, reason: string) =>
    rejectRoute(request(`${BASE}/${id}/reject`, { reason }), params(id)),
  reverse: (id: string, reason: string) =>
    reverseRoute(request(`${BASE}/${id}/reverse`, { reason }), params(id)),
  pdf: (id: string) => pdfRoute(request(`${BASE}/${id}/pdf`), params(id)),
  clause: (body: Record<string, unknown>) =>
    createClauseRoute(request(`${HOST}/escalation-clauses`, body)),
  updateClause: (id: string, body: Record<string, unknown>) =>
    updateClauseRoute(
      request(`${HOST}/escalation-clauses/${id}/update`, body),
      params(id),
    ),
  deleteClause: (id: string) =>
    deleteClauseRoute(
      request(`${HOST}/escalation-clauses/${id}/delete`, {}),
      params(id),
    ),
  index: (series: string, month: string, value: number) =>
    createIndexRoute(
      request(`${HOST}/price-indices`, { series, month, value }),
    ),
};

/** The ticket's example: R ₹10,00,000 over Apr–Jun 2026, base Jan 2026. */
const LABOUR = "CPI-IW";
const MATERIAL = "WPI – All commodities";
const POL = "WPI – HSD (POL)";
const PERIOD = { fromMonth: "2026-04", toMonth: "2026-06" };
const EXAMPLE_COMPONENTS = [
  { component: "labour", weightPercent: "30", series: LABOUR },
  { component: "material", weightPercent: "50", series: MATERIAL },
  { component: "pol", weightPercent: "20", series: POL },
];

async function seedIndices() {
  const rows: [string, number[]][] = [
    [LABOUR, [140, 147, 147, 147]],
    [MATERIAL, [150, 153, 156, 159]],
    [POL, [120, 113, 114, 115]],
  ];
  for (const [series, values] of rows)
    for (const [index, value] of values.entries()) {
      const month = index === 0 ? "2026-01" : `2026-0${String(index + 3)}`;
      const response = await api.index(series, month, value);
      expect(response.status).toBe(StatusCodes.CREATED);
    }
}

async function setup() {
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
  const departmentId = await worksheetDepartment(ws, by, { name: "Civil" });
  const contractorId = await worksheetContractor(ws, by, {
    projectIds: [projectId],
    departmentIds: [departmentId],
    name: "Velan Constructions",
  });
  await prisma.constructionMastersContractor.update({
    where: { id: contractorId },
    data: { stateCode: "33" },
  });
  actAs(owner);

  /** An issued Work Order: Excavation 100 cum at ₹400; 5 % retention, 18 % GST. */
  const issued = async () => {
    const created = await createWorkOrderRoute(
      request(`${HOST}/work-orders`, {
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
            rate: rs(400),
          },
        ],
        terms: { retentionPercent: "5", sacCode: "9954", gstRate: "18" },
      }),
    );
    expect(created.status).toBe(StatusCodes.CREATED);
    const draft = await json<WorkOrder>(created);
    await submitWorkOrderRoute(
      request(`${HOST}/work-orders/${draft.id}/submit`, {}),
      params(draft.id),
    );
    const approved = await json<WorkOrder>(
      await approveWorkOrderRoute(
        request(`${HOST}/work-orders/${draft.id}/approve`, {}),
        params(draft.id),
      ),
    );
    return { id: approved.id, lineId: approved.lines[0]?.id ?? "" };
  };

  const running = (
    workOrderId: string,
    billDate: string,
    gross: number,
    extra: {
      status?: "draft" | "approved" | "reversed";
      ordinal?: number;
    } = {},
  ) =>
    addRunningBill(ws, by, {
      projectId,
      side: "contractor",
      workOrderId,
      billDate,
      gross: BigInt(gross),
      ...extra,
    });

  const clause = async (
    workOrderId: string,
    components: unknown[] = EXAMPLE_COMPONENTS,
  ) => {
    const response = await api.clause({
      projectId,
      workOrderId,
      baseMonth: "2026-01",
      components,
    });
    expect(response.status, JSON.stringify(await response.clone().json())).toBe(
      StatusCodes.CREATED,
    );
    return json<Clause>(response);
  };

  const draft = async (
    workOrderId: string,
    extra: Record<string, unknown> = {},
  ) => {
    const response = await api.create({
      projectId,
      workOrderId,
      billDate: TODAY,
      ...PERIOD,
      ...extra,
    });
    expect(response.status, JSON.stringify(await response.clone().json())).toBe(
      StatusCodes.CREATED,
    );
    return json<Bill>(response);
  };

  const approved = async (bill: Bill) => {
    const submitted = await api.submit(bill.id);
    expect(
      submitted.status,
      JSON.stringify(await submitted.clone().json()),
    ).toBe(StatusCodes.OK);
    const response = await api.approve(bill.id);
    expect(response.status, JSON.stringify(await response.clone().json())).toBe(
      StatusCodes.OK,
    );
    return json<Bill>(response);
  };

  const invoice = async (id: string) =>
    json<Invoice>(
      await getInvoiceRoute(getFrom(`/invoices/${id}`), idParams(id)),
    );

  return {
    ws,
    by,
    owner,
    projectId,
    contractorId,
    cum,
    issued,
    running,
    clause,
    draft,
    approved,
    invoice,
  };
}

describe("escalation clauses (CM-1109)", () => {
  it("needs weights summing to 100, one per Work Order, and locks once used", async () => {
    const ctx = await setup();
    const order = await ctx.issued();
    const short = await api.clause({
      projectId: ctx.projectId,
      workOrderId: order.id,
      baseMonth: "2026-01",
      components: EXAMPLE_COMPONENTS.slice(0, 2),
    });
    expect(short.status).toBe(StatusCodes.BAD_REQUEST);
    expect(await errorOf(short)).toMatchObject({
      code: "ESCALATION_WEIGHTS_NOT_100",
      details: { total: "80.00" },
    });
    const clause = await ctx.clause(order.id);
    expect(clause.clause).toMatchObject({
      baseMonth: "2026-01-01",
      nonEscalablePercent: "15.00",
    });
    expect(clause.clause?.components.map((row) => row.weightPercent)).toEqual([
      "30.00",
      "50.00",
      "20.00",
    ]);
    const again = await api.clause({
      projectId: ctx.projectId,
      workOrderId: order.id,
      baseMonth: "2026-01",
      components: EXAMPLE_COMPONENTS,
    });
    expect((await errorOf(again)).code).toBe("ESCALATION_CLAUSE_EXISTS");
    const read = await json<Clause>(
      await workOrderClauseRoute(
        request(`${HOST}/work-orders/${order.id}/escalation-clause`),
        params(order.id),
      ),
    );
    expect(read.canEdit).toBe(true);

    // An edit while nothing uses it.
    const edited = await json<Clause>(
      await api.updateClause(clause.clause?.id ?? "", {
        baseMonth: "2026-01",
        nonEscalablePercent: "15",
        components: EXAMPLE_COMPONENTS,
        expectedUpdatedAt: clause.clause?.updatedAt,
      }),
    );
    // Approved escalation bill → locked.
    await seedIndices();
    await ctx.running(order.id, "2026-04-30", rs(10_00_000), { ordinal: 1 });
    await ctx.approved(await ctx.draft(order.id));
    const locked = await api.updateClause(edited.clause?.id ?? "", {
      baseMonth: "2026-02",
      components: EXAMPLE_COMPONENTS,
      expectedUpdatedAt: edited.clause?.updatedAt,
    });
    expect(locked.status).toBe(StatusCodes.CONFLICT);
    expect((await errorOf(locked)).code).toBe("ESCALATION_CLAUSE_USED");
    expect(
      (await errorOf(await api.deleteClause(edited.clause?.id ?? ""))).code,
    ).toBe("ESCALATION_CLAUSE_USED");
  });
});

describe("escalation bills, contractor side (CM-1109)", () => {
  it("takes the approved running bills dated in the period and works the ticket's example exactly", async () => {
    const ctx = await setup();
    await seedIndices();
    const order = await ctx.issued();
    const other = await ctx.issued();
    await ctx.clause(order.id);
    const april = await ctx.running(order.id, "2026-04-30", rs(4_00_000), {
      ordinal: 2,
    });
    const june = await ctx.running(order.id, "2026-06-15", rs(6_00_000), {
      ordinal: 4,
    });
    // Not taken: before the period, reversed, a draft, another Work Order.
    await ctx.running(order.id, "2026-03-31", rs(9_00_000), { ordinal: 1 });
    await ctx.running(order.id, "2026-05-10", rs(5_00_000), {
      status: "reversed",
      ordinal: 3,
    });
    await ctx.running(order.id, "2026-05-20", rs(7_00_000), {
      status: "draft",
    });
    await ctx.running(other.id, "2026-05-15", rs(3_00_000), { ordinal: 1 });

    const options =
      await json<ConstructionContractsEscalationFormOptionsResponseModel>(
        await api.formOptions(`projectId=${ctx.projectId}&side=contractor`),
      );
    expect(
      options.workOrders.find((row) => row.id === order.id)?.baseMonth,
    ).toBe("2026-01-01");
    const preview =
      await json<PreviewConstructionContractsEscalationBillResponseModel>(
        await api.preview(
          `projectId=${ctx.projectId}&workOrderId=${order.id}&fromMonth=2026-04&toMonth=2026-06`,
        ),
      );
    expect(preview.working.valueOfWork).toBe(rs(10_00_000));
    expect(preview.working.bills.map((row) => row.id)).toEqual([april, june]);

    const bill = await ctx.draft(order.id);
    expect(bill).toMatchObject({
      type: "escalation",
      side: "contractor",
      status: "draft",
      periodFrom: "2026-04-01",
      periodTo: "2026-06-30",
      number: null,
    });
    const [labour, material, pol] = bill.working.components;
    expect(labour).toMatchObject({
      weightPercent: "30.00",
      series: LABOUR,
      baseIndex: "140.0000",
      averageIndex: "147.0000",
      factor: "0.050000",
      amount: rs(12_750),
    });
    expect(material).toMatchObject({
      baseIndex: "150.0000",
      indices: [
        { month: "2026-04-01", value: "153.0000" },
        { month: "2026-05-01", value: "156.0000" },
        { month: "2026-06-01", value: "159.0000" },
      ],
      averageIndex: "156.0000",
      factor: "0.040000",
      amount: rs(17_000),
    });
    expect(pol).toMatchObject({
      averageIndex: "114.0000",
      factor: "-0.050000",
      amount: rs(-8_500),
    });
    // Gross ₹21,250; GST 18 % ₹3,825 (CGST + SGST, both in Tamil Nadu);
    // retention 5 % ₹1,062.50; net ₹24,012.50.
    expect(bill).toMatchObject({
      gross: rs(21_250),
      gst: rs(3_825),
      cgst: rs(1_912.5),
      sgst: rs(1_912.5),
      supplyType: "intra_state",
      deductions: rs(1_062.5),
      net: rs(24_012.5),
    });
    expect(bill.deductionLines).toEqual([
      expect.objectContaining({ kind: "retention", amount: rs(1_062.5) }),
    ]);
    // The running bills list shows it with its type.
    const list = await json<{ items: { id: string; type: string }[] }>(
      await listRunningRoute(
        request(
          `${HOST}/contractor-bills?projectId=${ctx.projectId}&type=escalation`,
        ),
      ),
    );
    expect(list.items.map((row) => [row.id, row.type])).toEqual([
      [bill.id, "escalation"],
    ]);

    // Approve → a payable invoice (origin ra_bill) for the net.
    const done = await ctx.approved(bill);
    expect(done.number).toMatch(/\S/);
    expect(done.ordinal).toBe(1);
    expect(done.status).toBe("approved");
    const invoice = await ctx.invoice(done.invoiceId ?? "");
    expect(invoice).toMatchObject({
      origin: "ra_bill",
      raBillType: "escalation",
      direction: "payable",
      sourceId: done.id,
      invoiceNumber: done.number,
      taxableAmount: rs(21_250),
      gstAmount: rs(3_825),
      amount: rs(24_012.5),
    });

    // A running bill it takes cannot be reversed under it.
    const blocked = await reverseRunningRoute(
      request(`${HOST}/contractor-bills/${june}/reverse`, { reason: "Wrong" }),
      params(june),
    );
    expect(blocked.status).toBe(StatusCodes.CONFLICT);
    expect((await errorOf(blocked)).code).toBe("BILL_IN_ESCALATION");

    // Approved periods cannot overlap.
    const overlap = await api.create({
      projectId: ctx.projectId,
      workOrderId: order.id,
      billDate: TODAY,
      fromMonth: "2026-06",
      toMonth: "2026-06",
    });
    expect(overlap.status).toBe(StatusCodes.CONFLICT);
    expect(await errorOf(overlap)).toMatchObject({
      code: "ESCALATION_PERIOD_OVERLAP",
      details: { periodFrom: "2026-04-01", periodTo: "2026-06-30" },
    });

    const pdf = await api.pdf(done.id);
    expect(pdf.status).toBe(StatusCodes.OK);
    expect(pdf.headers.get("content-type")).toBe("application/pdf");

    // Reverse: the invoice goes; the running bill is free to reverse again.
    const reversed = await json<Bill>(
      await api.reverse(done.id, "Indices revised"),
    );
    expect(reversed.status).toBe("reversed");
    const gone = await prisma.constructionFinanceInvoice.findUnique({
      where: { id: done.invoiceId ?? "" },
    });
    expect(gone?.deletedAt).not.toBeNull();
  });

  it("refuses a missing index, a period with no bills, no clause, and a stale draft", async () => {
    const ctx = await setup();
    await seedIndices();
    const order = await ctx.issued();
    const bare = await api.create({
      projectId: ctx.projectId,
      workOrderId: order.id,
      billDate: TODAY,
      ...PERIOD,
    });
    expect((await errorOf(bare)).code).toBe("ESCALATION_CLAUSE_REQUIRED");
    await ctx.clause(order.id);
    const empty = await api.create({
      projectId: ctx.projectId,
      workOrderId: order.id,
      billDate: TODAY,
      ...PERIOD,
    });
    expect((await errorOf(empty)).code).toBe("ESCALATION_NO_BILLS");
    await ctx.running(order.id, "2026-07-10", rs(1_00_000), { ordinal: 1 });
    const missing = await api.create({
      projectId: ctx.projectId,
      workOrderId: order.id,
      billDate: TODAY,
      fromMonth: "2026-07",
      toMonth: "2026-07",
    });
    expect(missing.status).toBe(StatusCodes.BAD_REQUEST);
    expect(await errorOf(missing)).toMatchObject({
      code: "PRICE_INDEX_MISSING",
      details: { series: LABOUR, month: "2026-07-01" },
    });

    // A draft goes stale when a running bill in its period is approved.
    await ctx.running(order.id, "2026-04-15", rs(2_00_000), { ordinal: 2 });
    const bill = await ctx.draft(order.id);
    expect(bill.working.valueOfWork).toBe(rs(2_00_000));
    await ctx.running(order.id, "2026-05-15", rs(2_00_000), { ordinal: 3 });
    const stale = await api.submit(bill.id);
    expect(stale.status).toBe(StatusCodes.CONFLICT);
    expect((await errorOf(stale)).code).toBe("ESCALATION_WORKING_CHANGED");
    const refreshed = await json<Bill>(await api.refresh(bill.id));
    expect(refreshed.working.valueOfWork).toBe(rs(4_00_000));
    expect((await api.submit(bill.id)).status).toBe(StatusCodes.OK);
    const rejected = await json<Bill>(await api.reject(bill.id, "Check POL"));
    expect(rejected).toMatchObject({
      status: "rejected",
      rejectReason: "Check POL",
    });
    const second = await ctx.draft(order.id);
    expect((await api.remove(second.id)).status).toBe(StatusCodes.NO_CONTENT);
  });

  it("works a negative escalation and recovers it on the next running bill", async () => {
    const ctx = await setup();
    await seedIndices();
    const order = await ctx.issued();
    await ctx.clause(order.id, [
      { component: "pol", weightPercent: "100", series: POL },
    ]);
    await ctx.running(order.id, "2026-05-31", rs(10_00_000));
    const bill = await ctx.draft(order.id);
    // 85 % × 100 % × ₹10,00,000 × −5 % = −₹42,500; no GST, no retention.
    expect(bill).toMatchObject({
      gross: rs(-42_500),
      gst: 0,
      deductions: 0,
      net: rs(-42_500),
    });
    const done = await ctx.approved(bill);
    expect(done.invoiceId).toBeNull();
    expect(done.recovery).toEqual({
      amount: rs(42_500),
      recovered: 0,
      outstanding: rs(42_500),
    });

    // The next running bill (₹40,000 gross) holds the recovery.
    await measureWorkOrderLines(ctx.ws, ctx.by, {
      projectId: ctx.projectId,
      workOrderId: order.id,
      measuredOn: day(-2),
      rows: [{ workOrderLineId: order.lineId, quantity: "100" }],
    });
    const created = await createRunningRoute(
      request(`${HOST}/contractor-bills`, {
        projectId: ctx.projectId,
        workOrderId: order.id,
        billDate: TODAY,
        measuredUpTo: day(-1),
      }),
    );
    expect(created.status, JSON.stringify(await created.clone().json())).toBe(
      StatusCodes.CREATED,
    );
    const ra = await json<RunningBill>(created);
    expect(ra.escalationRecoveries).toEqual([
      expect.objectContaining({
        escalationBillId: done.id,
        amount: rs(42_500),
        balance: rs(42_500),
      }),
    ]);
    // Gross ₹40,000 + GST ₹7,200 − retention ₹2,000 − recovery ₹42,500 = ₹2,700.
    expect(ra.deductionLines).toEqual([
      expect.objectContaining({ kind: "retention", amount: rs(2_000) }),
      expect.objectContaining({
        kind: "other",
        amount: rs(42_500),
        escalationBillId: done.id,
        description: `Escalation recovery on ${done.number ?? ""} (Apr 2026 – Jun 2026)`,
      }),
    ]);
    expect(ra.net).toBe(rs(2_700));

    // More than is left is refused.
    const over = await updateRunningRoute(
      request(`${HOST}/contractor-bills/${ra.id}/update`, {
        billDate: ra.billDate,
        measuredUpTo: ra.measuredUpTo,
        expectedUpdatedAt: ra.updatedAt,
        deductions: [
          {
            kind: "other",
            amount: rs(42_500.01),
            description: "Escalation recovery",
            escalationBillId: done.id,
          },
        ],
      }),
      params(ra.id),
    );
    expect(await errorOf(over)).toMatchObject({
      code: "BILL_ESCALATION_RECOVERY_OVER_BALANCE",
      details: { max: rs(42_500) },
    });
    const kept = await json<RunningBill>(
      await getRunningRoute(
        request(`${HOST}/contractor-bills/${ra.id}`),
        params(ra.id),
      ),
    );
    expect(kept.net).toBe(rs(2_700));

    // While a running bill recovers it, the escalation bill stays.
    const reverse = await api.reverse(done.id, "Wrong");
    expect((await errorOf(reverse)).code).toBe("ESCALATION_RECOVERED");
  });

  it("checks the side's flags and keeps each Company's bills apart", async () => {
    const ctx = await setup();
    await seedIndices();
    const order = await ctx.issued();
    await ctx.clause(order.id);
    await ctx.running(order.id, "2026-04-30", rs(10_00_000));
    const bill = await ctx.draft(order.id);
    const reader = await addMember(ctx.ws, ctx.by, {
      "contracts.contractor_bills": ["read"],
      "contracts.work_orders": ["read", "update"],
    });
    actAs({ userId: reader.userId, workspaceId: ctx.ws, role: "member" });
    // A member on no Project is refused before anything else.
    expect((await api.get(bill.id)).status).toBe(StatusCodes.FORBIDDEN);
    await sharedAssign(reader.memberId, ctx.projectId);
    const seen = await json<Bill>(await api.get(bill.id));
    expect(seen.gross).toBeNull();
    expect(seen.working.components[0]?.amount).toBeNull();
    expect(seen.working.components[0]?.weightPercent).toBeNull();
    expect(seen.working.components[0]?.baseIndex).toBe("140.0000");
    expect(
      (
        await api.create({
          projectId: ctx.projectId,
          workOrderId: order.id,
          billDate: TODAY,
          ...PERIOD,
        })
      ).status,
    ).toBe(StatusCodes.FORBIDDEN);
    expect((await api.approve(bill.id)).status).toBe(StatusCodes.FORBIDDEN);
    // Work Order Update without Financial cannot set a clause.
    const clause = await api.clause({
      projectId: ctx.projectId,
      workOrderId: order.id,
      baseMonth: "2026-01",
      components: EXAMPLE_COMPONENTS,
    });
    expect(clause.status).toBe(StatusCodes.FORBIDDEN);

    const other = await newCompany("Other Builders");
    actAs({ userId: other.ownerId, workspaceId: other.workspaceId });
    const foreign = await api.get(bill.id);
    expect(foreign.status).toBe(StatusCodes.NOT_FOUND);
    expect((await errorOf(foreign)).code).toBe("BILL_NOT_FOUND");
  });
});

describe("escalation bills, client side (CM-1109)", () => {
  it("escalates the client's running bills and raises a receivable", async () => {
    const ctx = await setup();
    await seedIndices();
    const clientId = await addClient(ctx.ws, ctx.by);
    await prisma.constructionProjectsProject.update({
      where: { id: ctx.projectId },
      data: {
        role: "contract",
        clientId,
        clientName: "Tamil Nadu Housing Board",
      },
    });
    await addBillingAddress(ctx.ws, ctx.by, {
      stateCode: "33",
      gstin: "33AAACA1234A1Z5",
      isDefault: true,
    });
    const terms = await updateContractRoute(
      request(`${HOST}/client-bills/contract/update`, {
        projectId: ctx.projectId,
        retentionPercent: "5",
        sacCode: "9954",
        gstRate: "18",
      }),
    );
    expect(terms.status).toBe(StatusCodes.OK);
    const clause = await api.clause({
      projectId: ctx.projectId,
      baseMonth: "2026-01",
      components: [
        { component: "labour", weightPercent: "100", series: LABOUR },
      ],
    });
    expect(clause.status).toBe(StatusCodes.CREATED);
    const read = await json<Clause>(
      await clientClauseRoute(
        request(
          `${HOST}/client-bills/contract/escalation-clause?projectId=${ctx.projectId}`,
        ),
      ),
    );
    expect(read).toMatchObject({ side: "client", workOrderId: null });
    await addRunningBill(ctx.ws, ctx.by, {
      projectId: ctx.projectId,
      side: "client",
      clientId,
      billDate: "2026-05-31",
      gross: BigInt(rs(10_00_000)),
    });
    const response = await api.create({
      projectId: ctx.projectId,
      billDate: TODAY,
      ...PERIOD,
    });
    expect(response.status, JSON.stringify(await response.clone().json())).toBe(
      StatusCodes.CREATED,
    );
    const bill = await json<Bill>(response);
    // 85 % × ₹10,00,000 × 5 % = ₹42,500; GST ₹7,650; retention ₹2,125.
    expect(bill).toMatchObject({
      side: "client",
      partyId: clientId,
      gross: rs(42_500),
      gst: rs(7_650),
      deductions: rs(2_125),
      net: rs(48_025),
      supplierGstin: "33AAACA1234A1Z5",
      recipientGstin: "33AABCT1332L1ZU",
    });
    const done = await ctx.approved(bill);
    const invoice = await ctx.invoice(done.invoiceId ?? "");
    expect(invoice).toMatchObject({
      origin: "ra_bill",
      raBillType: "escalation",
      direction: "receivable",
      amount: rs(48_025),
      party: expect.objectContaining({ type: "client", id: clientId }),
    });
  });

  it("is in the OpenAPI document", async () => {
    const document = await json<{ paths: Record<string, unknown> }>(
      await getOpenApi(),
    );
    expect(Object.keys(document.paths)).toEqual(
      expect.arrayContaining([
        "/api/construction/contracts/escalation-bills",
        "/api/construction/contracts/escalation-bills/{id}/approve",
        "/api/construction/contracts/escalation-clauses",
        "/api/construction/contracts/price-indices",
      ]),
    );
  });
});
