import { prisma } from "@repo/construction-db";
import { StatusCodes } from "http-status-codes";
import { afterEach, describe, expect, it, vi } from "vitest";

import { POST as deleteInvoiceRoute } from "@/app/api/construction/finance/invoices/[id]/delete/route";
import { GET as getInvoiceRoute } from "@/app/api/construction/finance/invoices/[id]/route";
import { POST as updateInvoiceRoute } from "@/app/api/construction/finance/invoices/[id]/update/route";
import type { ConstructionFinanceInvoiceResponse } from "@/app/api/construction/finance/invoices/invoice-models";
import { POST as applyAdvanceRoute } from "@/app/api/construction/finance/party-payments/[id]/apply-advance/route";
import { POST as cancelPaymentRoute } from "@/app/api/construction/finance/party-payments/[id]/cancel/route";
import { GET as getPaymentRoute } from "@/app/api/construction/finance/party-payments/[id]/route";
import type { ConstructionFinancePartyPaymentResponse } from "@/app/api/construction/finance/party-payments/party-payment-models";
import { POST as recordPayment } from "@/app/api/construction/finance/party-payments/route";
import { GET as getOpenApi } from "@/app/api/openapi.json/route";
import { addMonths } from "@/src/contracts/domain/advance";
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

import { POST as approveBillRoute } from "../contractor-bills/[id]/approve/route";
import { POST as reverseBillRoute } from "../contractor-bills/[id]/reverse/route";
import { GET as getBillRoute } from "../contractor-bills/[id]/route";
import { POST as submitBillRoute } from "../contractor-bills/[id]/submit/route";
import { GET as billSuggestionsRoute } from "../contractor-bills/[id]/suggestions/route";
import { POST as updateBillRoute } from "../contractor-bills/[id]/update/route";
import type {
  ConstructionContractsContractorBillSuggestionsResponseModel,
  GetConstructionContractsContractorBillResponseModel,
  ListConstructionContractsContractorBillsResponseModel,
} from "../contractor-bills/contractor-bill-models";
import {
  GET as listBillsRoute,
  POST as createBillRoute,
} from "../contractor-bills/route";
import { GET as overviewRoute } from "../work-orders/[id]/advances-retention/route";
import { POST as approveWorkOrderRoute } from "../work-orders/[id]/approve/route";
import { POST as completionRoute } from "../work-orders/[id]/completion/route";
import { POST as submitWorkOrderRoute } from "../work-orders/[id]/submit/route";
import type { GetConstructionContractsWorkOrderResponseModel } from "../work-orders/work-order-models";
import { POST as createWorkOrderRoute } from "../work-orders/route";
import { POST as deleteGuaranteeRoute } from "../guarantees/[id]/delete/route";
import { POST as releaseGuaranteeRoute } from "../guarantees/[id]/release/route";
import { POST as updateGuaranteeRoute } from "../guarantees/[id]/update/route";
import { POST as addGuaranteeRoute } from "../guarantees/route";
import { POST as deleteReleaseRoute } from "../retention-releases/[id]/delete/route";
import { POST as releaseRoute } from "../retention-releases/route";
import { POST as deleteAdvanceRoute } from "./[id]/delete/route";
import { POST as updateAdvanceRoute } from "./[id]/update/route";
import type { GetConstructionContractsAdvancesRetentionResponseModel } from "./advance-models";
import { POST as recordAdvanceRoute } from "./route";

vi.mock(import("@repo/auth/construction/server"), async (importOriginal) => ({
  ...(await importOriginal()),
  getCompanyAuthFromHeaders: vi.fn(),
}));

afterEach(() => {
  vi.restoreAllMocks();
});

const CONTRACTS = "http://localhost/api/construction/contracts";

type Overview = GetConstructionContractsAdvancesRetentionResponseModel;
type Bill = GetConstructionContractsContractorBillResponseModel;
type WorkOrder = GetConstructionContractsWorkOrderResponseModel;
type Invoice = ConstructionFinanceInvoiceResponse;
type Payment = ConstructionFinancePartyPaymentResponse;

async function json<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

async function errorOf(
  response: Response,
): Promise<{
  code: string;
  message: string;
  details?: Record<string, unknown>;
}> {
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

const api = {
  overview: (workOrderId: string) =>
    overviewRoute(
      request(`${CONTRACTS}/work-orders/${workOrderId}/advances-retention`),
      params(workOrderId),
    ),
  completion: (workOrderId: string, completedOn: string) =>
    completionRoute(
      request(`${CONTRACTS}/work-orders/${workOrderId}/completion`, {
        completedOn,
      }),
      params(workOrderId),
    ),
  record: (body: Record<string, unknown>) =>
    recordAdvanceRoute(request(`${CONTRACTS}/advances`, body)),
  updateAdvance: (id: string, body: Record<string, unknown>) =>
    updateAdvanceRoute(
      request(`${CONTRACTS}/advances/${id}/update`, body),
      params(id),
    ),
  deleteAdvance: (id: string) =>
    deleteAdvanceRoute(
      request(`${CONTRACTS}/advances/${id}/delete`, {}),
      params(id),
    ),
  addGuarantee: (body: Record<string, unknown>) =>
    addGuaranteeRoute(request(`${CONTRACTS}/guarantees`, body)),
  updateGuarantee: (id: string, body: Record<string, unknown>) =>
    updateGuaranteeRoute(
      request(`${CONTRACTS}/guarantees/${id}/update`, body),
      params(id),
    ),
  releaseGuarantee: (id: string, releasedOn: string) =>
    releaseGuaranteeRoute(
      request(`${CONTRACTS}/guarantees/${id}/release`, { releasedOn }),
      params(id),
    ),
  deleteGuarantee: (id: string) =>
    deleteGuaranteeRoute(
      request(`${CONTRACTS}/guarantees/${id}/delete`, {}),
      params(id),
    ),
  release: (body: Record<string, unknown>) =>
    releaseRoute(request(`${CONTRACTS}/retention-releases`, body)),
  deleteRelease: (id: string, reason: string) =>
    deleteReleaseRoute(
      request(`${CONTRACTS}/retention-releases/${id}/delete`, { reason }),
      params(id),
    ),
  createBill: (body: Record<string, unknown>) =>
    createBillRoute(request(`${CONTRACTS}/contractor-bills`, body)),
  bill: (id: string) =>
    getBillRoute(request(`${CONTRACTS}/contractor-bills/${id}`), params(id)),
  bills: (projectId: string) =>
    listBillsRoute(
      request(`${CONTRACTS}/contractor-bills?projectId=${projectId}`),
    ),
  suggestions: (id: string) =>
    billSuggestionsRoute(
      request(`${CONTRACTS}/contractor-bills/${id}/suggestions`),
      params(id),
    ),
  updateBill: (id: string, body: Record<string, unknown>) =>
    updateBillRoute(
      request(`${CONTRACTS}/contractor-bills/${id}/update`, body),
      params(id),
    ),
  submitBill: (id: string) =>
    submitBillRoute(
      request(`${CONTRACTS}/contractor-bills/${id}/submit`, {}),
      params(id),
    ),
  approveBill: (id: string) =>
    approveBillRoute(
      request(`${CONTRACTS}/contractor-bills/${id}/approve`, {
        confirmUnbilled: true,
      }),
      params(id),
    ),
  reverseBill: (id: string, reason: string) =>
    reverseBillRoute(
      request(`${CONTRACTS}/contractor-bills/${id}/reverse`, { reason }),
      params(id),
    ),
};

/**
 * The worked example (ADR CM-0023 §8): a Work Order of 1,000 cum of
 * excavation at ₹400, 5 % retention (half released on completion), 18 %
 * GST (intra-state), an agreed mobilisation advance of ₹1,00,000 recovered
 * at 10 % of each bill, DLP 12 months.
 */
const ADVANCE = 1_00_000_00;
const GROSS = 4_00_000_00;
const GST = 72_000_00;
const RETENTION = 20_000_00;
const RECOVERY = 40_000_00;
const NET = GROSS + GST - RETENTION - RECOVERY; // ₹4,12,000
const INVOICE = NET + RECOVERY; // ₹4,52,000

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
  const departmentId = await worksheetDepartment(ws, by, { name: "Earthwork" });
  const contractorId = await worksheetContractor(ws, by, {
    projectIds: [projectId],
    departmentIds: [departmentId],
    name: "Velan Constructions",
  });
  await prisma.constructionMastersContractor.update({
    where: { id: contractorId },
    data: { stateCode: "33" },
  });
  // TDS applies: the advance's payment carries none (with the reason), the
  // bill's cash payment overrides it below.
  await contractorTds(contractorId, { pan: "ABCPK1234F", tdsApplicable: true });
  const accounts = await seededAccounts(ws);
  actAs(owner);

  const created = await createWorkOrderRoute(
    request(`${CONTRACTS}/work-orders`, {
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
          quantity: "1000",
          rate: 400_00,
        },
      ],
      terms: {
        retentionPercent: "5",
        sacCode: "9954",
        gstRate: "18",
        dlpMonths: 12,
        mobilisationAdvance: ADVANCE,
        mobilisationRecoveryPercent: "10",
      },
    }),
  );
  expect(created.status, JSON.stringify(await created.clone().json())).toBe(
    StatusCodes.CREATED,
  );
  const draftWo = await json<WorkOrder>(created);
  await submitWorkOrderRoute(
    request(`${CONTRACTS}/work-orders/${draftWo.id}/submit`, {}),
    params(draftWo.id),
  );
  const workOrder = await json<WorkOrder>(
    await approveWorkOrderRoute(
      request(`${CONTRACTS}/work-orders/${draftWo.id}/approve`, {}),
      params(draftWo.id),
    ),
  );
  const lineId = workOrder.lines[0]?.id ?? "";

  const advance = async (extra: Record<string, unknown> = {}) => {
    const response = await api.record({
      projectId,
      workOrderId: workOrder.id,
      kind: "mobilisation",
      amount: ADVANCE,
      advanceOn: day(-20),
      recoveryMode: "percent",
      accountId: accounts.bankId,
      mode: "online",
      reference: `NEFT-${String(Math.random()).slice(2, 10)}`,
      ...extra,
    });
    expect(response.status, JSON.stringify(await response.clone().json())).toBe(
      StatusCodes.CREATED,
    );
    return json<Overview>(response);
  };

  const measure = (quantity: string, measuredOn = day(-5)) =>
    measureWorkOrderLines(ws, by, {
      projectId,
      workOrderId: workOrder.id,
      measuredOn,
      rows: [{ workOrderLineId: lineId, quantity }],
    });

  const draftBill = async (extra: Record<string, unknown> = {}) => {
    const response = await api.createBill({
      projectId,
      workOrderId: workOrder.id,
      billDate: TODAY,
      measuredUpTo: day(-1),
      ...extra,
    });
    expect(response.status, JSON.stringify(await response.clone().json())).toBe(
      StatusCodes.CREATED,
    );
    return json<Bill>(response);
  };

  const approve = async (id: string) => {
    const submitted = await api.submitBill(id);
    expect(
      submitted.status,
      JSON.stringify(await submitted.clone().json()),
    ).toBe(StatusCodes.OK);
    const response = await api.approveBill(id);
    expect(response.status, JSON.stringify(await response.clone().json())).toBe(
      StatusCodes.OK,
    );
    return json<Bill>(response);
  };

  const overview = async () => json<Overview>(await api.overview(workOrder.id));
  const balance = () => partyBalance(ws, "contractor", contractorId, projectId);
  const invoiceOf = async (id: string) =>
    json<Invoice>(
      await getInvoiceRoute(getFrom(`/invoices/${id}`), idParams(id)),
    );
  const pay = (body: Record<string, unknown>) =>
    recordPayment(
      postTo("/party-payments", {
        partyType: "contractor",
        partyId: contractorId,
        projectId,
        paymentDate: TODAY,
        accountId: accounts.bankId,
        mode: "online",
        reference: `UTR-${String(Math.random()).slice(2, 10)}`,
        tdsAmount: 0,
        tdsOverrideReason: "Test: TDS settled separately",
        ...body,
      }),
    );

  return {
    ws,
    by,
    owner,
    projectId,
    contractorId,
    departmentId,
    workOrder,
    lineId,
    ...accounts,
    advance,
    measure,
    draftBill,
    approve,
    overview,
    balance,
    invoiceOf,
    pay,
  };
}

type Ctx = Awaited<ReturnType<typeof setup>>;

async function member(ctx: Ctx, permissions: Record<string, Flag[]>) {
  const added = await addMember(ctx.ws, ctx.by, permissions);
  await sharedAssign(added.memberId, ctx.projectId);
  return { userId: added.userId, workspaceId: ctx.ws, role: "member" as const };
}

describe("Advances given on a Work Order (CM-1108)", () => {
  it("pays the advance on account, recovers it from the bill, and settles the invoice by allocation", async () => {
    const ctx = await setup();
    const before = await ctx.balance();
    const recorded = await ctx.advance();
    const advance = recorded.advances[0];
    expect(recorded).toMatchObject({
      side: "contractor",
      workOrderId: ctx.workOrder.id,
      party: { id: ctx.contractorId, name: "Velan Constructions" },
      agreedMobilisation: ADVANCE,
      defaultRecoveryPercent: "10.00",
      warnings: [],
      advances: [
        {
          direction: "given",
          kind: "mobilisation",
          amount: ADVANCE,
          recoveryMode: "percent",
          recoveryPercent: "10.00",
          recovered: 0,
          balance: ADVANCE,
        },
      ],
      advanceTotals: { amount: ADVANCE, recovered: 0, balance: ADVANCE },
    });
    const advanceId = advance?.id ?? "";
    const paymentId = advance?.payment?.id ?? "";
    expect(advance?.payment?.number).toMatch(/^PAY\//);

    // An on-account Payment Out: −₹1,00,000 on the Contractor, unallocated.
    expect(await ctx.balance()).toBe(before - BigInt(ADVANCE));
    const payment = await json<Payment>(
      await getPaymentRoute(
        getFrom(`/party-payments/${paymentId}`),
        idParams(paymentId),
      ),
    );
    expect(payment).toMatchObject({
      direction: "out",
      amount: ADVANCE,
      unallocated: ADVANCE,
      contractAdvance: {
        label: `mobilisation advance on Work Order ${ctx.workOrder.number ?? ""}`,
      },
      actions: { cancel: false, applyAdvance: false },
    });
    expect(payment.remarks).toContain("Mobilisation advance on Work Order");
    // Finance leaves it to Contracts.
    const cancel = await cancelPaymentRoute(
      postTo(`/party-payments/${paymentId}/cancel`, {
        expectedUpdatedAt: payment.updatedAt,
      }),
      idParams(paymentId),
    );
    expect(cancel.status).toBe(StatusCodes.CONFLICT);
    expect((await errorOf(cancel)).code).toBe("PAYMENT_FROM_ADVANCE");

    // The bill: ₹4,00,000 gross suggests 10 % = ₹40,000, held in the draft.
    await ctx.measure("1000");
    const draft = await ctx.draftBill();
    expect(draft.deductionLines).toEqual([
      expect.objectContaining({ kind: "retention", amount: RETENTION }),
      expect.objectContaining({
        kind: "mobilisation_recovery",
        amount: RECOVERY,
        advanceId,
      }),
    ]);
    expect(draft).toMatchObject({
      gross: GROSS,
      gst: GST,
      net: NET,
      advances: [
        {
          id: advanceId,
          recoveryKind: "mobilisation_recovery",
          balance: ADVANCE,
          suggested: RECOVERY,
        },
      ],
    });
    const suggestions =
      await json<ConstructionContractsContractorBillSuggestionsResponseModel>(
        await api.suggestions(draft.id),
      );
    expect(suggestions).toMatchObject({
      mobilisationRecovery: RECOVERY,
      recoveries: [{ id: advanceId, suggested: RECOVERY }],
    });

    const approved = await ctx.approve(draft.id);
    const invoiceId = approved.invoiceId ?? "";
    // The invoice is the net plus the recovery, settled ₹40,000 by the advance.
    const invoice = await ctx.invoiceOf(invoiceId);
    expect(invoice).toMatchObject({
      origin: "ra_bill",
      amount: INVOICE,
      taxableAmount: GROSS,
      gstAmount: GST,
      allocated: RECOVERY,
      balance: NET,
      status: "partly_paid",
      payments: [{ paymentId, amount: RECOVERY }],
    });
    // −1,00,000 + 4,52,000: ₹3,52,000 owed = ₹4,12,000 due − ₹60,000 still advanced.
    expect(await ctx.balance()).toBe(before + 3_52_000_00n);
    expect((await ctx.overview()).advances[0]).toMatchObject({
      recovered: RECOVERY,
      balance: ADVANCE - RECOVERY,
    });
    const paid = await json<Payment>(
      await getPaymentRoute(
        getFrom(`/party-payments/${paymentId}`),
        idParams(paymentId),
      ),
    );
    expect(paid).toMatchObject({
      allocated: RECOVERY,
      unallocated: ADVANCE - RECOVERY,
    });
    const entries = await prisma.constructionFinancePartyEntry.findMany({
      where: {
        workspaceId: ctx.ws,
        partyId: ctx.contractorId,
        projectId: ctx.projectId,
      },
      orderBy: { createdAt: "asc" },
      select: { kind: true, amount: true },
    });
    expect(entries).toEqual([
      { kind: "payment", amount: -BigInt(ADVANCE) },
      { kind: "invoice", amount: BigInt(INVOICE) },
    ]);

    // A cash payment of the net settles the invoice; ₹60,000 stays advanced.
    const cash = await ctx.pay({
      amount: NET,
      allocations: [{ invoiceId, amount: NET }],
    });
    expect(cash.status, JSON.stringify(await cash.clone().json())).toBe(
      StatusCodes.CREATED,
    );
    const cashPayment = await json<Payment>(cash);
    expect(await ctx.balance()).toBe(before - 60_000_00n);
    expect(await ctx.invoiceOf(invoiceId)).toMatchObject({
      allocated: INVOICE,
      balance: 0,
      status: "paid",
    });

    // Paid in cash: the bill cannot be reversed.
    const settled = await api.reverseBill(approved.id, "Rate revised");
    expect(settled.status).toBe(StatusCodes.CONFLICT);
    expect((await errorOf(settled)).code).toBe("BILL_SETTLED");
    // Cancel the cash; its own recovery does not count as settled.
    const cancelled = await cancelPaymentRoute(
      postTo(`/party-payments/${cashPayment.id}/cancel`, {
        expectedUpdatedAt: cashPayment.updatedAt,
      }),
      idParams(cashPayment.id),
    );
    expect(cancelled.status).toBe(StatusCodes.NO_CONTENT);
    expect(await ctx.balance()).toBe(before + 3_52_000_00n);
    const reversed = await api.reverseBill(approved.id, "Rate revised");
    expect(reversed.status, JSON.stringify(await reversed.clone().json())).toBe(
      StatusCodes.OK,
    );
    // Back to the open advance: −₹1,00,000, nothing recovered.
    expect(await ctx.balance()).toBe(before - BigInt(ADVANCE));
    expect((await ctx.overview()).advances[0]).toMatchObject({
      recovered: 0,
      balance: ADVANCE,
    });
    const back = await json<Payment>(
      await getPaymentRoute(
        getFrom(`/party-payments/${paymentId}`),
        idParams(paymentId),
      ),
    );
    expect(back).toMatchObject({ allocated: 0, unallocated: ADVANCE });
  });

  it("refuses a recovery without its advance or above what is left, and warns beyond the agreed advance", async () => {
    const ctx = await setup();
    await ctx.measure("1000");
    // No advance yet: a manual mobilisation recovery needs one now.
    const plain = await ctx.draftBill();
    const update = (deductions: Record<string, unknown>[]) =>
      api.updateBill(plain.id, {
        billDate: TODAY,
        measuredUpTo: day(-1),
        expectedUpdatedAt: plain.updatedAt,
        deductions,
      });
    const none = await update([
      { kind: "mobilisation_recovery", amount: 5_000_00 },
    ]);
    expect(none.status).toBe(StatusCodes.BAD_REQUEST);
    expect(await errorOf(none)).toMatchObject({
      code: "BILL_RECOVERY_ADVANCE_REQUIRED",
      details: { field: "deductions.0.advanceId" },
    });

    const recorded = await ctx.advance({ amount: 30_000_00 });
    const small = recorded.advances[0]?.id ?? "";
    const over = await update([
      { kind: "mobilisation_recovery", amount: 30_000_01, advanceId: small },
    ]);
    expect(over.status).toBe(StatusCodes.BAD_REQUEST);
    expect(await errorOf(over)).toMatchObject({
      code: "BILL_RECOVERY_OVER_BALANCE",
      details: { max: 30_000_00 },
    });
    const wrongKind = await update([
      { kind: "secured_advance_recovery", amount: 1_00, advanceId: small },
    ]);
    expect((await errorOf(wrongKind)).code).toBe("BILL_RECOVERY_KIND_MISMATCH");
    const ok = await update([
      { kind: "retention", amount: RETENTION },
      { kind: "mobilisation_recovery", amount: 30_000_00, advanceId: small },
    ]);
    expect(ok.status, JSON.stringify(await ok.clone().json())).toBe(
      StatusCodes.OK,
    );

    // ₹30,000 + ₹80,000 is more than the ₹1,00,000 agreed: a warning only.
    const second = await ctx.advance({ amount: 80_000_00 });
    expect(second.warnings).toEqual([
      {
        code: "ADVANCES_OVER_AGREED",
        message:
          "Mobilisation advances given (₹1,10,000.00) are more than the ₹1,00,000.00 the Work Order agrees.",
      },
    ]);

    // The advance named by a draft cannot be deleted; one no bill names can,
    // and its payment is cancelled with it.
    const used = await api.deleteAdvance(small);
    expect(used.status).toBe(StatusCodes.CONFLICT);
    expect((await errorOf(used)).code).toBe("ADVANCE_RECOVERED");
    const before = await ctx.balance();
    const secondId = second.advances.find((row) => row.id !== small)?.id ?? "";
    const deleted = await api.deleteAdvance(secondId);
    expect(deleted.status, JSON.stringify(await deleted.clone().json())).toBe(
      StatusCodes.OK,
    );
    expect(
      (await json<Overview>(deleted)).advances.map((row) => row.id),
    ).toEqual([small]);
    expect(await ctx.balance()).toBe(before + 80_000_00n);

    // The recovery rule changes while nothing is recovered.
    const current = (await ctx.overview()).advances[0];
    const changed = await api.updateAdvance(small, {
      expectedUpdatedAt: current?.updatedAt,
      recoveryMode: "fixed",
      recoveryValue: 7_500_00,
      remarks: "Per running bill",
    });
    expect(changed.status, JSON.stringify(await changed.clone().json())).toBe(
      StatusCodes.OK,
    );
    expect((await json<Overview>(changed)).advances[0]).toMatchObject({
      recoveryMode: "fixed",
      recoveryAmount: 7_500_00,
      recoveryPercent: null,
      remarks: "Per running bill",
    });
    const stale = await api.updateAdvance(small, {
      expectedUpdatedAt: current?.updatedAt,
      recoveryMode: "percent",
    });
    expect((await errorOf(stale)).code).toBe("ADVANCE_CHANGED");
  });

  it("checks Update, Financial and finance Parties Create, and hides money without Financial", async () => {
    const ctx = await setup();
    const reader = await member(ctx, { "contracts.work_orders": ["read"] });
    actAs(reader);
    const view = await json<Overview>(await api.overview(ctx.workOrder.id));
    expect(view).toMatchObject({
      financial: false,
      agreedMobilisation: null,
      retention: { deducted: null, releasable: null },
      allowed: { recordAdvance: false, update: false, delete: false },
    });
    const body = {
      projectId: ctx.projectId,
      workOrderId: ctx.workOrder.id,
      kind: "mobilisation",
      amount: ADVANCE,
      advanceOn: day(-1),
      recoveryMode: "percent",
      accountId: ctx.cashId,
      mode: "cash",
    };
    expect((await api.record(body)).status).toBe(StatusCodes.FORBIDDEN);

    const noFinancial = await member(ctx, {
      "contracts.work_orders": ["read", "update"],
      "finance.parties": ["read", "create"],
    });
    actAs(noFinancial);
    expect((await api.record(body)).status).toBe(StatusCodes.FORBIDDEN);

    const noFinance = await member(ctx, {
      "contracts.work_orders": ["read", "update", "financial"],
    });
    actAs(noFinance);
    const refused = await api.record(body);
    expect(refused.status).toBe(StatusCodes.FORBIDDEN);
    expect(
      await prisma.constructionContractsAdvance.count({
        where: { workspaceId: ctx.ws },
      }),
    ).toBe(0);
    expect(
      (await json<Overview>(await api.overview(ctx.workOrder.id))).allowed,
    ).toMatchObject({ update: true, recordAdvance: false });

    const full = await member(ctx, {
      "contracts.work_orders": ["read", "update", "financial"],
      "finance.parties": ["read", "create"],
    });
    actAs(full);
    const recorded = await api.record(body);
    expect(recorded.status, JSON.stringify(await recorded.clone().json())).toBe(
      StatusCodes.CREATED,
    );
    const id = (await json<Overview>(recorded)).advances[0]?.id ?? "";
    // Deleting needs Delete.
    expect((await api.deleteAdvance(id)).status).toBe(StatusCodes.FORBIDDEN);

    // Another Company sees none of it.
    const other = await newCompany();
    actAs({
      userId: other.ownerId,
      workspaceId: other.workspaceId,
      role: "owner",
    });
    const missing = await api.overview(ctx.workOrder.id);
    expect(missing.status).toBe(StatusCodes.NOT_FOUND);
    expect((await errorOf(missing)).code).toBe("WORK_ORDER_NOT_FOUND");
    const foreign = await api.deleteAdvance(id);
    expect(foreign.status).toBe(StatusCodes.NOT_FOUND);
    expect((await errorOf(foreign)).code).toBe("ADVANCE_NOT_FOUND");
    const foreignRecord = await api.record({
      ...body,
      projectId: ctx.projectId,
    });
    expect(foreignRecord.status).toBe(StatusCodes.NOT_FOUND);
    expect((await errorOf(foreignRecord)).code).toBe("PROJECT_NOT_FOUND");
  });

  it("refuses Apply advance on an advance's payment in finance", async () => {
    const ctx = await setup();
    const recorded = await ctx.advance();
    const paymentId = recorded.advances[0]?.payment?.id ?? "";
    const payment = await json<Payment>(
      await getPaymentRoute(
        getFrom(`/party-payments/${paymentId}`),
        idParams(paymentId),
      ),
    );
    const applied = await applyAdvanceRoute(
      postTo(`/party-payments/${paymentId}/apply-advance`, {
        expectedUpdatedAt: payment.updatedAt,
        allocations: [{ invoiceId: paymentId, amount: 1 }],
      }),
      idParams(paymentId),
    );
    expect(applied.status).toBe(StatusCodes.CONFLICT);
    expect((await errorOf(applied)).code).toBe("PAYMENT_FROM_ADVANCE");
  });
});

describe("Retention release, bank guarantees and DLP on a Work Order (CM-1108)", () => {
  it("releases on completion, against a guarantee and early at the DLP end, each as a payable invoice", async () => {
    const ctx = await setup();
    await ctx.measure("1000");
    const bill = await ctx.approve((await ctx.draftBill()).id);
    expect(bill.retentionHeldOnWorkOrder).toBe(RETENTION);
    const start = await ctx.overview();
    expect(start).toMatchObject({
      retention: {
        percent: "5.00",
        completionPercent: "50.00",
        deducted: RETENTION,
        released: 0,
        releasable: RETENTION,
        completionSuggestion: 10_000_00,
        dlpEndSuggestion: RETENTION,
      },
      dlp: { startsOn: null, months: 12, endsOn: null, ended: false },
      allowed: { setCompletion: true, releaseEarly: true },
    });
    const release = (body: Record<string, unknown>) =>
      api.release({
        projectId: ctx.projectId,
        workOrderId: ctx.workOrder.id,
        releasedOn: TODAY,
        ...body,
      });

    // Completion needs the completion date.
    const early = await release({ stage: "completion", amount: 10_000_00 });
    expect(early.status).toBe(StatusCodes.CONFLICT);
    expect((await errorOf(early)).code).toBe("COMPLETION_DATE_REQUIRED");
    const completed = await api.completion(ctx.workOrder.id, day(-10));
    expect(
      completed.status,
      JSON.stringify(await completed.clone().json()),
    ).toBe(StatusCodes.OK);
    expect((await json<Overview>(completed)).dlp).toMatchObject({
      startsOn: day(-10),
      months: 12,
      ended: false,
    });
    expect(
      (await errorOf(await api.completion(ctx.workOrder.id, day(1)))).code,
    ).toBe("COMPLETED_ON_IN_FUTURE");

    const before = await ctx.balance();
    const atCompletion = await release({
      stage: "completion",
      amount: 10_000_00,
    });
    expect(
      atCompletion.status,
      JSON.stringify(await atCompletion.clone().json()),
    ).toBe(StatusCodes.CREATED);
    const afterCompletion = await json<Overview>(atCompletion);
    const completionRelease = afterCompletion.releases[0];
    expect(afterCompletion.retention).toMatchObject({
      released: 10_000_00,
      releasable: 10_000_00,
      completionSuggestion: 0,
      dlpEndSuggestion: 10_000_00,
    });
    expect(completionRelease).toMatchObject({
      stage: "completion",
      amount: 10_000_00,
      settled: false,
      invoice: { number: `${ctx.workOrder.number ?? ""}/RET-1` },
    });
    // A payable invoice for the release: no taxable value, no GST.
    const invoiceId = completionRelease?.invoice?.id ?? "";
    const invoice = await ctx.invoiceOf(invoiceId);
    expect(invoice).toMatchObject({
      origin: "retention_release",
      sourceId: completionRelease?.id,
      direction: "payable",
      party: { type: "contractor", id: ctx.contractorId },
      department: { id: ctx.departmentId },
      amount: 10_000_00,
      taxableAmount: null,
      gstAmount: null,
      retentionRelease: {
        side: "contractor",
        workOrderId: ctx.workOrder.id,
        workOrderNumber: ctx.workOrder.number,
      },
      actions: { edit: false, delete: false },
    });
    expect(await ctx.balance()).toBe(before + 10_000_00n);
    // Retention held falls by the release everywhere it shows.
    const list =
      await json<ListConstructionContractsContractorBillsResponseModel>(
        await api.bills(ctx.projectId),
      );
    expect(list.retentionHeld).toEqual([
      expect.objectContaining({
        contractorId: ctx.contractorId,
        amount: 10_000_00,
      }),
    ]);
    expect(
      (await json<Bill>(await api.bill(bill.id))).retentionHeldOnWorkOrder,
    ).toBe(10_000_00);

    // Finance refuses to change it.
    const edit = await updateInvoiceRoute(
      postTo(`/invoices/${invoiceId}/update`, {
        expectedUpdatedAt: invoice.updatedAt,
        invoiceNumber: "X",
        invoiceDate: TODAY,
        amount: 1_00,
      }),
      idParams(invoiceId),
    );
    expect(edit.status).toBe(StatusCodes.CONFLICT);
    expect(await errorOf(edit)).toMatchObject({
      code: "INVOICE_FROM_RETENTION_RELEASE",
      message: `This invoice comes from a retention release on ${ctx.workOrder.number ?? ""}. Delete the release in Contracts to change it.`,
    });
    const remove = await deleteInvoiceRoute(
      postTo(`/invoices/${invoiceId}/delete`, {
        expectedUpdatedAt: invoice.updatedAt,
      }),
      idParams(invoiceId),
    );
    expect((await errorOf(remove)).code).toBe("INVOICE_FROM_RETENTION_RELEASE");

    // Over what is releasable.
    const over = await release({
      stage: "other",
      amount: 10_000_01,
      reason: "Agreed",
    });
    expect(over.status).toBe(StatusCodes.BAD_REQUEST);
    expect(await errorOf(over)).toMatchObject({
      code: "RELEASE_OVER_RELEASABLE",
      details: { max: 10_000_00 },
    });

    // Against a guarantee: it must be a live retention one.
    const noGuarantee = await release({
      stage: "bank_guarantee",
      amount: 4_000_00,
    });
    expect((await errorOf(noGuarantee)).code).toBe(
      "RELEASE_GUARANTEE_REQUIRED",
    );
    const guarantee = (purpose: string) =>
      api.addGuarantee({
        projectId: ctx.projectId,
        workOrderId: ctx.workOrder.id,
        purpose,
        number: `BG/${purpose}`,
        bank: "State Bank of India",
        amount: 10_000_00,
        issuedOn: day(-5),
        expiresOn: day(200),
      });
    const performance = await json<Overview>(await guarantee("performance"));
    const performanceId = performance.guarantees[0]?.id ?? "";
    const wrong = await release({
      stage: "bank_guarantee",
      amount: 4_000_00,
      bankGuaranteeId: performanceId,
    });
    expect((await errorOf(wrong)).code).toBe("RELEASE_GUARANTEE_INVALID");
    const retentionBg = await json<Overview>(await guarantee("retention"));
    const bgId =
      retentionBg.guarantees.find((row) => row.purpose === "retention")?.id ??
      "";
    expect(retentionBg.guarantees).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: bgId,
          status: "live",
          daysToExpiry: 200,
          amount: 10_000_00,
        }),
      ]),
    );
    const againstBg = await release({
      stage: "bank_guarantee",
      amount: 4_000_00,
      bankGuaranteeId: bgId,
    });
    expect(
      againstBg.status,
      JSON.stringify(await againstBg.clone().json()),
    ).toBe(StatusCodes.CREATED);
    const bgRelease = (await json<Overview>(againstBg)).releases.find(
      (row) => row.stage === "bank_guarantee",
    );
    expect(bgRelease).toMatchObject({
      bankGuarantee: { id: bgId, number: "BG/retention" },
      invoice: { number: `${ctx.workOrder.number ?? ""}/RET-2` },
    });
    // A guarantee released against stays: not deleted, not repurposed.
    expect((await errorOf(await api.deleteGuarantee(bgId))).code).toBe(
      "GUARANTEE_IN_USE",
    );

    // The DLP ends in a year: only Approve with a reason releases it now.
    const approverless = await member(ctx, {
      "contracts.work_orders": ["read", "update", "financial"],
    });
    actAs(approverless);
    const notEnded = await release({ stage: "dlp_end", amount: 6_000_00 });
    expect(notEnded.status).toBe(StatusCodes.CONFLICT);
    expect(await errorOf(notEnded)).toMatchObject({
      code: "DLP_NOT_ENDED",
      details: { dlpEndsOn: addMonths(day(-10), 12) },
    });
    actAs(ctx.owner);
    expect(
      (await errorOf(await release({ stage: "dlp_end", amount: 6_000_00 })))
        .code,
    ).toBe("RELEASE_REASON_REQUIRED");
    const dlpEnd = await release({
      stage: "dlp_end",
      amount: 6_000_00,
      reason: "Defects closed; Client agreed",
    });
    expect(dlpEnd.status, JSON.stringify(await dlpEnd.clone().json())).toBe(
      StatusCodes.CREATED,
    );
    expect((await json<Overview>(dlpEnd)).retention).toMatchObject({
      released: RETENTION,
      releasable: 0,
    });

    // Paid releases stay; an unpaid one is deleted with a reason, invoice and all.
    const paid = await ctx.pay({
      amount: 10_000_00,
      allocations: [{ invoiceId, amount: 10_000_00 }],
    });
    expect(paid.status, JSON.stringify(await paid.clone().json())).toBe(
      StatusCodes.CREATED,
    );
    const blocked = await api.deleteRelease(
      completionRelease?.id ?? "",
      "Typo",
    );
    expect(blocked.status).toBe(StatusCodes.CONFLICT);
    expect((await errorOf(blocked)).code).toBe("RELEASE_SETTLED");
    expect(
      (await errorOf(await api.deleteRelease(bgRelease?.id ?? "", " "))).code,
    ).toBe("DELETE_REASON_REQUIRED");
    const balanceBefore = await ctx.balance();
    const deleted = await api.deleteRelease(
      bgRelease?.id ?? "",
      "Released against the wrong guarantee",
    );
    expect(deleted.status, JSON.stringify(await deleted.clone().json())).toBe(
      StatusCodes.OK,
    );
    expect((await json<Overview>(deleted)).retention).toMatchObject({
      released: 16_000_00,
      releasable: 4_000_00,
    });
    expect(await ctx.balance()).toBe(balanceBefore - 4_000_00n);
    const gone = await prisma.constructionFinanceInvoice.findUniqueOrThrow({
      where: { id: bgRelease?.invoice?.id ?? "" },
    });
    expect(gone.deletedAt).not.toBeNull();
    const audit = await prisma.constructionOrganizationAuditEvent.findFirst({
      where: {
        workspaceId: ctx.ws,
        action: "retention_release.deleted",
        entityId: bgRelease?.id ?? "",
      },
    });
    expect(audit?.after).toMatchObject({
      reason: "Released against the wrong guarantee",
    });
  });

  it("edits a guarantee until it is released", async () => {
    const ctx = await setup();
    const added = await json<Overview>(
      await api.addGuarantee({
        projectId: ctx.projectId,
        workOrderId: ctx.workOrder.id,
        purpose: "performance",
        number: "BG/77",
        bank: "Indian Bank",
        amount: 50_000_00,
        issuedOn: day(-1),
        expiresOn: day(20),
      }),
    );
    const bg = added.guarantees[0];
    const advanceBg = await api.addGuarantee({
      projectId: ctx.projectId,
      workOrderId: ctx.workOrder.id,
      purpose: "advance",
      number: "BG/78",
      bank: "Indian Bank",
      amount: 50_000_00,
      issuedOn: day(-1),
      expiresOn: day(20),
    });
    expect((await errorOf(advanceBg)).code).toBe("GUARANTEE_ADVANCE_REQUIRED");
    const edited = await api.updateGuarantee(bg?.id ?? "", {
      expectedUpdatedAt: bg?.updatedAt,
      purpose: "performance",
      number: "BG/77A",
      bank: "Indian Bank",
      amount: 60_000_00,
      issuedOn: day(-1),
      expiresOn: day(40),
    });
    expect(edited.status, JSON.stringify(await edited.clone().json())).toBe(
      StatusCodes.OK,
    );
    const now = (await json<Overview>(edited)).guarantees[0];
    expect(now).toMatchObject({ number: "BG/77A", amount: 60_000_00 });
    const released = await api.releaseGuarantee(bg?.id ?? "", TODAY);
    expect((await json<Overview>(released)).guarantees[0]).toMatchObject({
      status: "released",
      releasedOn: TODAY,
    });
    const again = await api.updateGuarantee(bg?.id ?? "", {
      expectedUpdatedAt: now?.updatedAt,
      purpose: "performance",
      number: "BG/77B",
      bank: "Indian Bank",
      amount: 60_000_00,
      issuedOn: day(-1),
      expiresOn: day(40),
    });
    expect(again.status).toBe(StatusCodes.CONFLICT);
  });

  it("is on /api/docs", async () => {
    const doc = (await getOpenApi().json()) as {
      paths: Record<string, unknown>;
    };
    for (const path of [
      "/api/construction/contracts/advances",
      "/api/construction/contracts/advances/{id}/update",
      "/api/construction/contracts/advances/{id}/delete",
      "/api/construction/contracts/guarantees",
      "/api/construction/contracts/guarantees/{id}/update",
      "/api/construction/contracts/guarantees/{id}/release",
      "/api/construction/contracts/guarantees/{id}/delete",
      "/api/construction/contracts/retention-releases",
      "/api/construction/contracts/retention-releases/{id}/delete",
      "/api/construction/contracts/work-orders/{id}/advances-retention",
      "/api/construction/contracts/work-orders/{id}/completion",
      "/api/construction/contracts/client-bills/contract/advances-retention",
    ])
      expect(doc.paths).toHaveProperty([path]);
  });
});
