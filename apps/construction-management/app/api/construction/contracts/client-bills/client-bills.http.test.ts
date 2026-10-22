import { prisma } from "@repo/construction-db";
import { StatusCodes } from "http-status-codes";
import { afterEach, describe, expect, it, vi } from "vitest";

import { GET as centralPaymentRoute } from "@/app/api/construction/finance/central-payment/route";
import { POST as deleteInvoiceRoute } from "@/app/api/construction/finance/invoices/[id]/delete/route";
import { GET as getInvoiceRoute } from "@/app/api/construction/finance/invoices/[id]/route";
import { POST as updateInvoiceRoute } from "@/app/api/construction/finance/invoices/[id]/update/route";
import { POST as createInvoiceRoute } from "@/app/api/construction/finance/invoices/route";
import type { ConstructionFinanceInvoiceResponse } from "@/app/api/construction/finance/invoices/invoice-models";
import type { ListConstructionFinancePartyBalancesResponse } from "@/app/api/construction/finance/parties/party-balance-models";
import { GET as partyBalancesRoute } from "@/app/api/construction/finance/parties/route";
import { GET as workspaceBalancesRoute } from "@/app/api/construction/finance/party-balances/route";
import { POST as cancelPaymentRoute } from "@/app/api/construction/finance/party-payments/[id]/cancel/route";
import type { ConstructionFinancePartyPaymentResponse } from "@/app/api/construction/finance/party-payments/party-payment-models";
import { POST as recordPayment } from "@/app/api/construction/finance/party-payments/route";
import type { GetConstructionFinancePartyStatementResponse } from "@/app/api/construction/finance/party-statements/party-statement-models";
import { GET as statementRoute } from "@/app/api/construction/finance/party-statements/route";
import { GET as getOpenApi } from "@/app/api/openapi.json/route";
import type { Flag } from "@/src/shared-kernel/access";
import { addDays } from "@/src/shared-kernel/calendar-date";
import { actAs, addMember, addProject, newCompany } from "@/test/companies";
import { addClient, measureClientItems } from "@/test/contracts";
import { seededAccounts } from "@/test/finance";
import {
  getFrom,
  idParams,
  partyBalance,
  postTo,
  TODAY,
} from "@/test/party-finance";
import { addBillingAddress, unitNamed } from "@/test/procurement";
import { sharedAssign } from "@/test/site-work";

import type {
  ConstructionContractsBoqItemModel,
  ConstructionContractsBoqSectionResponseModel,
} from "../boq/boq-models";
import { POST as createBoqItemRoute } from "../boq/items/route";
import { POST as createSectionRoute } from "../boq/sections/route";
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
  ConstructionContractsClientBillFormOptionsResponseModel,
  ConstructionContractsClientBillSuggestionsResponseModel,
  GetConstructionContractsClientBillResponseModel,
  GetConstructionContractsClientContractResponseModel,
  ListConstructionContractsClientBillsResponseModel,
} from "./client-bill-models";
import { GET as contractRoute } from "./contract/route";
import { POST as updateContractRoute } from "./contract/update/route";
import { GET as formOptionsRoute } from "./form-options/route";
import { GET as listRoute, POST as createRoute } from "./route";

vi.mock(import("@repo/auth/construction/server"), async (importOriginal) => ({
  ...(await importOriginal()),
  getCompanyAuthFromHeaders: vi.fn(),
}));

afterEach(() => {
  vi.restoreAllMocks();
});

const BASE = "http://localhost/api/construction/contracts/client-bills";
const BOQ = "http://localhost/api/construction/contracts/boq";

type Bill = GetConstructionContractsClientBillResponseModel;
type Invoice = ConstructionFinanceInvoiceResponse;
type Balances = ListConstructionFinancePartyBalancesResponse;

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
  contract: (projectId: string) =>
    contractRoute(request(`${BASE}/contract?projectId=${projectId}`)),
  saveContract: (body: Record<string, unknown>) =>
    updateContractRoute(request(`${BASE}/contract/update`, body)),
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
  approve: (id: string) =>
    approveRoute(request(`${BASE}/${id}/approve`, {}), params(id)),
  reject: (id: string, reason: string) =>
    rejectRoute(request(`${BASE}/${id}/reject`, { reason }), params(id)),
  reverse: (id: string, reason: string) =>
    reverseRoute(request(`${BASE}/${id}/reverse`, { reason }), params(id)),
  pdf: (id: string) => pdfRoute(request(`${BASE}/${id}/pdf`), params(id)),
};

const day = (offset: number) => addDays(TODAY, offset);

/** The worked example: 30 cum at ₹450 and 12 cum at ₹1,000, 18 % GST, 5 % retention. */
const GROSS = 25_500_00;
const GST = 4_590_00;
const RETENTION = 1_275_00;
const NET = GROSS + GST - RETENTION;

async function setup(
  options: {
    role?: "contract" | "own";
    client?: boolean;
    stateCode?: string | null;
  } = {},
) {
  const company = await newCompany();
  const ws = company.workspaceId;
  const by = company.ownerId;
  const owner = { userId: by, workspaceId: ws, role: "owner" as const };
  const projectId = await addProject(ws, by, "Housing Board Block C");
  const clientId = await addClient(ws, by);
  await prisma.constructionProjectsProject.update({
    where: { id: projectId },
    data: {
      role: options.role ?? "contract",
      clientId: options.client === false ? null : clientId,
      clientName: "Tamil Nadu Housing Board",
      stateCode: options.stateCode === undefined ? "33" : options.stateCode,
    },
  });
  await addBillingAddress(ws, by, {
    stateCode: "33",
    gstin: "33AAACA1234A1Z5",
    isDefault: true,
  });
  const cum = await unitNamed(ws, by, "cum");
  const accounts = await seededAccounts(ws);
  actAs(owner);
  const section = await json<ConstructionContractsBoqSectionResponseModel>(
    await createSectionRoute(
      request(`${BOQ}/sections`, { projectId, title: "Civil works" }),
    ),
  );
  const addBoqItem = async (itemNo: string, quantity: string, rate: number) => {
    const response = await createBoqItemRoute(
      request(`${BOQ}/items`, {
        projectId,
        sectionId: section.id,
        itemNo,
        description: `Item ${itemNo}`,
        uomId: cum,
        quantity,
        rate,
      }),
    );
    expect(response.status).toBe(StatusCodes.CREATED);
    return json<ConstructionContractsBoqItemModel>(response);
  };
  const excavation = await addBoqItem("1.1", "100", 450_00);
  const concrete = await addBoqItem("1.2", "10", 1_000_00);
  const terms = await api.saveContract({
    projectId,
    retentionPercent: "5",
    sacCode: "9954",
    gstRate: "18",
  });
  expect(terms.status, JSON.stringify(await terms.clone().json())).toBe(
    StatusCodes.OK,
  );

  const measure = (
    measuredOn: string,
    rows: { boqItemId: string; quantity: string }[],
  ) => measureClientItems(ws, by, { projectId, measuredOn, rows });

  const draft = async (extra: Record<string, unknown> = {}) => {
    const response = await api.create({
      projectId,
      billDate: TODAY,
      measuredUpTo: day(-1),
      ...extra,
    });
    expect(response.status, JSON.stringify(await response.clone().json())).toBe(
      StatusCodes.CREATED,
    );
    return json<Bill>(response);
  };

  const approved = async (extra: Record<string, unknown> = {}) => {
    const bill = await draft(extra);
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

  const balances = async () =>
    json<Balances>(
      await partyBalancesRoute(
        getFrom("/parties", { partyType: "client", projectId }),
      ),
    );

  return {
    ws,
    by,
    owner,
    projectId,
    clientId,
    cum,
    excavation,
    concrete,
    measure,
    draft,
    approved,
    balances,
    ...accounts,
  };
}

type Ctx = Awaited<ReturnType<typeof setup>>;

async function member(ctx: Ctx, flags: Flag[]) {
  const added = await addMember(ctx.ws, ctx.by, {
    "contracts.client_bills": flags,
  });
  await sharedAssign(added.memberId, ctx.projectId);
  return { userId: added.userId, workspaceId: ctx.ws, role: "member" as const };
}

describe("Client Bills (CM-1107)", () => {
  it("bills only Contract work Projects with a Client and a state (400s), and the list says what to fix", async () => {
    const own = await setup({ role: "own" });
    await own.measure(day(-5), [
      { boqItemId: own.excavation.id, quantity: "10" },
    ]);
    const notContract = await api.create({
      projectId: own.projectId,
      billDate: TODAY,
      measuredUpTo: day(-1),
    });
    expect(notContract.status).toBe(StatusCodes.BAD_REQUEST);
    expect((await errorOf(notContract)).code).toBe("PROJECT_NOT_CONTRACT_WORK");
    const ownList =
      await json<ListConstructionContractsClientBillsResponseModel>(
        await api.list(`projectId=${own.projectId}`),
      );
    expect(ownList.setup.blockers).toEqual(["PROJECT_NOT_CONTRACT_WORK"]);

    const noClient = await setup({ client: false });
    const refusedClient = await api.create({
      projectId: noClient.projectId,
      billDate: TODAY,
      measuredUpTo: day(-1),
    });
    expect(refusedClient.status).toBe(StatusCodes.BAD_REQUEST);
    expect((await errorOf(refusedClient)).code).toBe("PROJECT_CLIENT_REQUIRED");
    const options =
      await json<ConstructionContractsClientBillFormOptionsResponseModel>(
        await api.formOptions(noClient.projectId),
      );
    expect(options.setup).toMatchObject({
      role: "contract",
      clientId: null,
      blockers: ["PROJECT_CLIENT_REQUIRED"],
    });

    const noState = await setup({ stateCode: null });
    const refusedState = await api.create({
      projectId: noState.projectId,
      billDate: TODAY,
      measuredUpTo: day(-1),
    });
    expect(refusedState.status).toBe(StatusCodes.BAD_REQUEST);
    expect((await errorOf(refusedState)).code).toBe("PROJECT_STATE_REQUIRED");
  });

  it("drafts at the BOQ rate as a tax invoice; billing past the BOQ quantity is a deviation, not an error", async () => {
    const ctx = await setup();
    const rows = await ctx.measure(day(-5), [
      { boqItemId: ctx.concrete.id, quantity: "12" },
      { boqItemId: ctx.excavation.id, quantity: "30" },
    ]);
    // Measured after "measured up to": left for the next bill.
    await ctx.measure(TODAY, [{ boqItemId: ctx.excavation.id, quantity: "5" }]);
    const options =
      await json<ConstructionContractsClientBillFormOptionsResponseModel>(
        await api.formOptions(ctx.projectId),
      );
    expect(options).toMatchObject({
      setup: { blockers: [] },
      unbilled: [
        { measuredOn: day(-5), rows: 2 },
        { measuredOn: TODAY, rows: 1 },
      ],
      openBillId: null,
    });

    const bill = await ctx.draft();
    expect(bill).toMatchObject({
      status: "draft",
      number: null,
      clientId: ctx.clientId,
      clientName: "Tamil Nadu Housing Board",
      gross: GROSS,
      gst: GST,
      cgst: GST / 2,
      sgst: GST / 2,
      igst: 0,
      supplyType: "intra_state",
      deductions: RETENTION,
      net: NET,
      sacCode: "9954",
      gstRate: "18.00",
      supplierGstin: "33AAACA1234A1Z5",
      recipientGstin: "33AABCT1332L1ZU",
      placeOfSupply: { stateCode: "33", stateName: "Tamil Nadu" },
      warnings: [],
      retention: { percent: "5.00", suggested: RETENTION },
    });
    // BOQ order: 1.1 before 1.2, whatever order the rows came in.
    expect(bill.lines).toMatchObject([
      {
        boqItemId: ctx.excavation.id,
        rate: 450_00,
        quantity: "30.0000",
        boqQuantity: "100.0000",
        amount: 13_500_00,
        deviation: { over: false },
      },
      {
        boqItemId: ctx.concrete.id,
        rate: 1_000_00,
        quantity: "12.0000",
        cumulativeQuantity: "12.0000",
        boqQuantity: "10.0000",
        amount: 12_000_00,
        deviation: {
          over: true,
          overBy: "2.0000",
          percentOver: "20.00",
          overLimit: false,
        },
      },
    ]);
    const stored = await prisma.constructionContractsBill.findUniqueOrThrow({
      where: { id: bill.id },
    });
    expect(stored).toMatchObject({
      side: "client",
      supplierGstin: "33AAACA1234A1Z5",
      recipientGstin: "33AABCT1332L1ZU",
      placeOfSupplyStateCode: "33",
      reverseCharge: false,
    });
    const taken = await prisma.constructionContractsMeasurementRow.findMany({
      where: { id: { in: rows.rowIds } },
    });
    expect(taken.every((row) => row.billId === bill.id)).toBe(true);

    // One open bill per Project.
    const second = await api.create({
      projectId: ctx.projectId,
      billDate: TODAY,
      measuredUpTo: TODAY,
    });
    expect(second.status).toBe(StatusCodes.CONFLICT);
    expect((await errorOf(second)).code).toBe("BILL_OPEN_EXISTS");

    const suggestions =
      await json<ConstructionContractsClientBillSuggestionsResponseModel>(
        await api.suggestions(bill.id),
      );
    expect(suggestions).toMatchObject({
      retention: { suggested: RETENTION },
      mobilisationRecovery: null,
    });

    // Typed deductions; the net follows.
    const edited = await api.update(bill.id, {
      billDate: TODAY,
      measuredUpTo: day(-1),
      expectedUpdatedAt: bill.updatedAt,
      deductions: [
        { kind: "retention", amount: 1_000_00 },
        { kind: "material_at_cost", amount: 500_00, description: "Cement" },
      ],
    });
    expect(edited.status, JSON.stringify(await edited.clone().json())).toBe(
      StatusCodes.OK,
    );
    expect(await json<Bill>(edited)).toMatchObject({
      deductions: 1_500_00,
      net: GROSS + GST - 1_500_00,
    });
    const overCap = await api.update(bill.id, {
      billDate: TODAY,
      measuredUpTo: day(-1),
      expectedUpdatedAt: (await json<Bill>(await api.get(bill.id))).updatedAt,
      deductions: [{ kind: "retention", amount: RETENTION + 1 }],
    });
    expect(overCap.status).toBe(StatusCodes.BAD_REQUEST);
    expect((await errorOf(overCap)).code).toBe("BILL_RETENTION_OVER_CAP");

    // Refresh takes today's row too.
    const refreshed = await json<Bill>(
      await api.refresh(bill.id, { measuredUpTo: TODAY }),
    );
    expect(refreshed.lines[0]).toMatchObject({ quantity: "35.0000" });
  });

  it("warns GSTIN_NOT_IN_STATE and charges IGST when the Company has no GSTIN in the Project's state", async () => {
    const ctx = await setup({ stateCode: "29" });
    await ctx.measure(day(-5), [
      { boqItemId: ctx.excavation.id, quantity: "30" },
      { boqItemId: ctx.concrete.id, quantity: "12" },
    ]);
    const bill = await ctx.draft();
    expect(bill).toMatchObject({
      supplierGstin: "33AAACA1234A1Z5",
      placeOfSupply: { stateCode: "29", stateName: "Karnataka" },
      supplyType: "inter_state",
      igst: GST,
      cgst: 0,
      sgst: 0,
      warnings: [{ code: "GSTIN_NOT_IN_STATE" }],
    });
    // A GSTIN in Karnataka is used once the Company has one.
    await addBillingAddress(ctx.ws, ctx.by, {
      stateCode: "29",
      gstin: "29AAACA1234A1Z3",
    });
    const refreshed = await json<Bill>(await api.refresh(bill.id));
    expect(refreshed).toMatchObject({
      supplierGstin: "29AAACA1234A1Z3",
      supplyType: "intra_state",
      cgst: GST / 2,
      warnings: [],
    });
    const pdf = await api.pdf(bill.id);
    expect(pdf.status).toBe(StatusCodes.OK);
    expect(pdf.headers.get("content-type")).toBe("application/pdf");
    expect((await pdf.arrayBuffer()).byteLength).toBeGreaterThan(1000);
  });

  it("approval creates one receivable ra_bill invoice to the Client with exact amounts, read-only in finance", async () => {
    const ctx = await setup();
    await ctx.measure(day(-5), [
      { boqItemId: ctx.excavation.id, quantity: "30" },
      { boqItemId: ctx.concrete.id, quantity: "12" },
    ]);
    const bill = await ctx.approved();
    expect(bill).toMatchObject({
      status: "approved",
      ordinal: 1,
      retentionReceivable: RETENTION,
    });
    expect(bill.number).toMatch(/^RA\//);
    expect(bill.invoiceId).not.toBeNull();

    const invoices = await prisma.constructionFinanceInvoice.findMany({
      where: { workspaceId: ctx.ws, sourceId: bill.id },
    });
    expect(invoices).toHaveLength(1);
    expect(invoices[0]).toMatchObject({
      id: bill.invoiceId,
      partyType: "client",
      partyId: ctx.clientId,
      projectId: ctx.projectId,
      direction: "receivable",
      origin: "ra_bill",
      invoiceNumber: bill.number,
      invoiceDate: new Date(`${TODAY}T00:00:00.000Z`),
      dueDate: null,
      taxableAmount: BigInt(GROSS),
      gstAmount: BigInt(GST),
      amount: BigInt(NET),
    });
    const entries = await prisma.constructionFinancePartyEntry.findMany({
      where: { workspaceId: ctx.ws, partyType: "client" },
    });
    expect(entries.map((entry) => [entry.kind, entry.amount])).toEqual([
      ["sales_invoice", BigInt(-NET)],
    ]);
    expect(
      await partyBalance(ctx.ws, "client", ctx.clientId, ctx.projectId),
    ).toBe(BigInt(-NET));

    const invoiceId = bill.invoiceId ?? "";
    const invoice = await json<Invoice>(
      await getInvoiceRoute(
        getFrom(`/invoices/${invoiceId}`),
        idParams(invoiceId),
      ),
    );
    expect(invoice).toMatchObject({
      origin: "ra_bill",
      sourceId: bill.id,
      direction: "receivable",
      party: { type: "client", id: ctx.clientId },
      actions: { edit: false, delete: false },
    });
    const edit = await updateInvoiceRoute(
      postTo(`/invoices/${invoiceId}/update`, {
        invoiceDate: TODAY,
        amount: 1_00,
        expectedUpdatedAt: invoice.updatedAt,
      }),
      idParams(invoiceId),
    );
    expect(edit.status).toBe(StatusCodes.CONFLICT);
    expect((await errorOf(edit)).code).toBe("INVOICE_FROM_CLIENT_BILL");
    const remove = await deleteInvoiceRoute(
      postTo(`/invoices/${invoiceId}/delete`, {
        expectedUpdatedAt: invoice.updatedAt,
      }),
      idParams(invoiceId),
    );
    expect(remove.status).toBe(StatusCodes.CONFLICT);
    expect((await errorOf(remove)).code).toBe("INVOICE_FROM_CLIENT_BILL");
    // Invoices to a Client come from Client Bills only.
    const manual = await createInvoiceRoute(
      postTo("/invoices", {
        partyType: "client",
        partyId: ctx.clientId,
        projectId: ctx.projectId,
        direction: "receivable",
        invoiceDate: TODAY,
        amount: 1_000_00,
      }),
    );
    expect(manual.status).toBe(StatusCodes.BAD_REQUEST);
    expect((await errorOf(manual)).code).toBe(
      "CLIENT_INVOICES_FROM_CLIENT_BILLS",
    );

    // The second bill bills from the first's quantities.
    await ctx.measure(day(-2), [
      { boqItemId: ctx.excavation.id, quantity: "10" },
    ]);
    const second = await ctx.draft();
    expect(second.lines).toMatchObject([
      {
        boqItemId: ctx.excavation.id,
        previousQuantity: "30.0000",
        quantity: "10.0000",
        cumulativeQuantity: "40.0000",
        amount: 4_500_00,
      },
    ]);
    // The first is no longer the latest while the second is open.
    const notLatest = await api.reverse(bill.id, "Wrong rate");
    expect(notLatest.status).toBe(StatusCodes.CONFLICT);
    expect((await errorOf(notLatest)).code).toBe("BILL_NOT_LATEST");
  });

  it("a receipt with the Client's TDS and GST-TDS settles the invoice; the balance shows due, retention, TDS and GST-TDS receivable", async () => {
    const ctx = await setup();
    await ctx.measure(day(-5), [
      { boqItemId: ctx.excavation.id, quantity: "30" },
      { boqItemId: ctx.concrete.id, quantity: "12" },
    ]);
    const bill = await ctx.approved();
    const invoiceId = bill.invoiceId ?? "";
    const tds = 510_00; // 2 % of the taxable value
    const gstTds = 510_00; // s.51, 2 % of the taxable value
    const cash = NET - tds - gstTds;
    const received = await recordPayment(
      postTo("/party-payments", {
        partyType: "client",
        partyId: ctx.clientId,
        projectId: ctx.projectId,
        direction: "in",
        paymentDate: TODAY,
        accountId: ctx.bankId,
        mode: "online",
        reference: "NEFT-778812",
        amount: cash,
        clientTdsAmount: tds,
        gstTdsAmount: gstTds,
        allocations: [{ invoiceId, amount: NET }],
      }),
    );
    expect(received.status, JSON.stringify(await received.clone().json())).toBe(
      StatusCodes.CREATED,
    );
    const payment =
      await json<ConstructionFinancePartyPaymentResponse>(received);
    expect(payment).toMatchObject({
      direction: "in",
      amount: cash,
      clientDeductions: { tds, gstTds },
      settled: NET,
      allocated: NET,
      unallocated: 0,
      tds: null,
    });

    const invoice = await json<Invoice>(
      await getInvoiceRoute(
        getFrom(`/invoices/${invoiceId}`),
        idParams(invoiceId),
      ),
    );
    expect(invoice).toMatchObject({ status: "paid", balance: 0 });
    // The account moved only by the cash.
    const accountEntries =
      await prisma.constructionFinanceAccountEntry.findMany({
        where: { workspaceId: ctx.ws, sourceId: payment.id },
      });
    expect(
      accountEntries.map((entry) => [entry.amount, entry.counterpartyKind]),
    ).toEqual([[BigInt(cash), "client"]]);
    expect(
      await partyBalance(ctx.ws, "client", ctx.clientId, ctx.projectId),
    ).toBe(0n);

    const balances = await ctx.balances();
    expect(balances.items).toMatchObject([
      {
        party: {
          type: "client",
          id: ctx.clientId,
          name: "Tamil Nadu Housing Board",
        },
        assigned: true,
        billed: NET,
        received: cash,
        clientTds: tds,
        gstTds,
        retentionReceivable: RETENTION,
        balance: 0,
        advance: 0,
      },
    ]);
    expect(balances.totals).toMatchObject({
      clientTds: tds,
      gstTds,
      retentionReceivable: RETENTION,
    });

    const statement = await json<GetConstructionFinancePartyStatementResponse>(
      await statementRoute(
        getFrom("/party-statements", {
          partyType: "client",
          partyId: ctx.clientId,
          projectId: ctx.projectId,
        }),
      ),
    );
    // The receipt's three entries share a date; their order is not fixed.
    expect(statement.lines[0]).toMatchObject({
      kind: "sales_invoice",
      amount: -NET,
    });
    expect(
      statement.lines.slice(1).map((line) => [line.kind, line.amount]),
    ).toEqual(
      expect.arrayContaining([
        ["receipt", cash],
        ["client_tds", tds],
        ["gst_tds", gstTds],
      ]),
    );
    expect(statement.lines).toHaveLength(4);
    expect(statement.closing).toBe(0);

    // Reverse is refused once a receipt is allocated.
    const settled = await api.reverse(bill.id, "Wrong rate");
    expect(settled.status).toBe(StatusCodes.CONFLICT);
    expect((await errorOf(settled)).code).toBe("BILL_SETTLED");
  });

  it("reverses cleanly once the receipt is cancelled: the invoice goes and the rows are free", async () => {
    const ctx = await setup();
    const rows = await ctx.measure(day(-5), [
      { boqItemId: ctx.excavation.id, quantity: "30" },
    ]);
    const bill = await ctx.approved();
    const invoiceId = bill.invoiceId ?? "";
    const received = await json<ConstructionFinancePartyPaymentResponse>(
      await recordPayment(
        postTo("/party-payments", {
          partyType: "client",
          partyId: ctx.clientId,
          projectId: ctx.projectId,
          direction: "in",
          paymentDate: TODAY,
          accountId: ctx.cashId,
          mode: "cash",
          amount: 1_000_00,
          allocations: [{ invoiceId, amount: 1_000_00 }],
        }),
      ),
    );
    expect((await api.reverse(bill.id, "Rate revised")).status).toBe(
      StatusCodes.CONFLICT,
    );
    const cancelled = await cancelPaymentRoute(
      postTo(`/party-payments/${received.id}/cancel`, {
        expectedUpdatedAt: received.updatedAt,
      }),
      idParams(received.id),
    );
    expect(cancelled.status).toBe(StatusCodes.NO_CONTENT);

    const noReason = await api.reverse(bill.id, "");
    expect(noReason.status).toBe(StatusCodes.BAD_REQUEST);
    const reversed = await api.reverse(bill.id, "Rate revised");
    expect(reversed.status, JSON.stringify(await reversed.clone().json())).toBe(
      StatusCodes.OK,
    );
    expect(await json<Bill>(reversed)).toMatchObject({
      status: "reversed",
      reverseReason: "Rate revised",
      retentionReceivable: 0,
    });
    const invoice = await prisma.constructionFinanceInvoice.findUniqueOrThrow({
      where: { id: invoiceId },
    });
    expect(invoice.deletedAt).not.toBeNull();
    expect(
      await partyBalance(ctx.ws, "client", ctx.clientId, ctx.projectId),
    ).toBe(0n);
    const freed = await prisma.constructionContractsMeasurementRow.findMany({
      where: { id: { in: rows.rowIds } },
    });
    expect(freed.every((row) => row.billId == null)).toBe(true);
    const list = await json<ListConstructionContractsClientBillsResponseModel>(
      await api.list(`projectId=${ctx.projectId}`),
    );
    expect(list).toMatchObject({
      retentionReceivable: 0,
      totals: { count: 0 },
      items: [{ id: bill.id, status: "reversed" }],
    });
    // The rows bill again.
    const again = await ctx.draft();
    expect(again.lines).toMatchObject([
      { previousQuantity: "0.0000", quantity: "30.0000" },
    ]);
  });

  it("refuses Payment Out to a Client and the Client's deductions on other parties' payments", async () => {
    const ctx = await setup();
    const out = await recordPayment(
      postTo("/party-payments", {
        partyType: "client",
        partyId: ctx.clientId,
        projectId: ctx.projectId,
        direction: "out",
        paymentDate: TODAY,
        accountId: ctx.cashId,
        mode: "cash",
        amount: 1_000_00,
      }),
    );
    expect(out.status).toBe(StatusCodes.BAD_REQUEST);
    expect((await errorOf(out)).code).toBe("PAYMENT_OUT_NOT_FOR_CLIENTS");

    // A receipt from a Client that is not the Project's is refused.
    const stranger = await addClient(ctx.ws, ctx.by, { name: "Other Board" });
    const notOnProject = await recordPayment(
      postTo("/party-payments", {
        partyType: "client",
        partyId: stranger,
        projectId: ctx.projectId,
        direction: "in",
        paymentDate: TODAY,
        accountId: ctx.cashId,
        mode: "cash",
        amount: 1_000_00,
      }),
    );
    expect(notOnProject.status).toBe(StatusCodes.BAD_REQUEST);
    expect((await errorOf(notOnProject)).code).toBe("PARTY_NOT_ON_PROJECT");

    // An advance from the Client: Payment In with nothing to allocate.
    const advance = await recordPayment(
      postTo("/party-payments", {
        partyType: "client",
        partyId: ctx.clientId,
        projectId: ctx.projectId,
        direction: "in",
        paymentDate: TODAY,
        accountId: ctx.cashId,
        mode: "cash",
        amount: 2_000_00,
        clientTdsAmount: 40_00,
      }),
    );
    expect(advance.status, JSON.stringify(await advance.clone().json())).toBe(
      StatusCodes.CREATED,
    );
    expect(
      await json<ConstructionFinancePartyPaymentResponse>(advance),
    ).toMatchObject({
      settled: 2_040_00,
      unallocated: 2_040_00,
    });
    const balances = await ctx.balances();
    expect(balances.items[0]).toMatchObject({
      received: 2_000_00,
      clientTds: 40_00,
      advance: 2_040_00,
      balance: 2_040_00,
    });
  });

  it("lists Clients in workspace balances and Central Payment", async () => {
    const ctx = await setup();
    await ctx.measure(day(-5), [
      { boqItemId: ctx.excavation.id, quantity: "30" },
      { boqItemId: ctx.concrete.id, quantity: "12" },
    ]);
    await ctx.approved();
    const workspace = await json<{
      partyType: string;
      items: { party: { id: string }; balance: number }[];
    }>(
      await workspaceBalancesRoute(
        getFrom("/party-balances", { partyType: "client" }),
      ),
    );
    expect(workspace).toMatchObject({
      partyType: "client",
      items: [{ party: { id: ctx.clientId }, balance: -NET }],
    });
    const central = await json<{
      parties: { client: { partyId: string; receivable: number }[] };
    }>(await centralPaymentRoute(getFrom("/central-payment")));
    expect(central.parties.client).toMatchObject([
      { partyId: ctx.clientId, receivable: NET },
    ]);
  });

  it("keeps the client contract terms with a stale check", async () => {
    const ctx = await setup();
    const terms =
      await json<GetConstructionContractsClientContractResponseModel>(
        await api.contract(ctx.projectId),
      );
    expect(terms).toMatchObject({
      terms: {
        retentionPercent: "5.00",
        retentionCapPercent: null,
        retentionCompletionPercent: "50.00",
        sacCode: "9954",
        gstRate: "18.00",
      },
      boqValue: 100 * 450_00 + 10 * 1_000_00,
      canEdit: true,
    });
    const stale = await api.saveContract({
      projectId: ctx.projectId,
      retentionPercent: "5",
      expectedUpdatedAt: new Date(0).toISOString(),
    });
    expect(stale.status).toBe(StatusCodes.CONFLICT);
    expect((await errorOf(stale)).code).toBe("CLIENT_CONTRACT_CHANGED");
    const bad = await api.saveContract({
      projectId: ctx.projectId,
      gstRate: "40",
      expectedUpdatedAt: terms.updatedAt,
    });
    expect(bad.status).toBe(StatusCodes.BAD_REQUEST);
    expect((await errorOf(bad)).code).toBe("GST_RATE_INVALID");
    const saved = await api.saveContract({
      projectId: ctx.projectId,
      retentionPercent: "5",
      retentionCapPercent: "1",
      dlpMonths: 12,
      handoverOn: "2027-03-31",
      sacCode: "9954",
      gstRate: "18",
      expectedUpdatedAt: terms.updatedAt,
    });
    expect(saved.status).toBe(StatusCodes.OK);
    // The cap: 1 % of ₹55,000 is ₹550, so retention stops there.
    await ctx.measure(day(-5), [
      { boqItemId: ctx.excavation.id, quantity: "30" },
      { boqItemId: ctx.concrete.id, quantity: "12" },
    ]);
    const bill = await ctx.draft();
    expect(bill.retention).toMatchObject({
      capPercent: "1.00",
      cap: 550_00,
      suggested: 550_00,
    });
    expect(bill.deductions).toBe(550_00);
  });

  it("answers 403 without the flag, quantities only without Financial, and 404 for another Company's bill", async () => {
    const ctx = await setup();
    await ctx.measure(day(-5), [
      { boqItemId: ctx.excavation.id, quantity: "30" },
    ]);
    const bill = await ctx.draft();

    const reader = await member(ctx, ["read"]);
    actAs(reader);
    const read = await json<Bill>(await api.get(bill.id));
    expect(read).toMatchObject({ gross: null, net: null, financial: false });
    expect(read.lines[0]).toMatchObject({ rate: null, quantity: "30.0000" });
    const create = await api.create({
      projectId: ctx.projectId,
      billDate: TODAY,
      measuredUpTo: day(-1),
    });
    expect(create.status).toBe(StatusCodes.FORBIDDEN);
    expect((await api.approve(bill.id)).status).toBe(StatusCodes.FORBIDDEN);
    expect((await api.pdf(bill.id)).status).toBe(StatusCodes.FORBIDDEN);
    expect(
      (
        await api.saveContract({
          projectId: ctx.projectId,
          retentionPercent: "1",
        })
      ).status,
    ).toBe(StatusCodes.FORBIDDEN);

    const nobody = await member(ctx, []);
    actAs(nobody);
    expect((await api.list(`projectId=${ctx.projectId}`)).status).toBe(
      StatusCodes.FORBIDDEN,
    );

    const printer = await member(ctx, ["read", "print"]);
    actAs(printer);
    const pdf = await api.pdf(bill.id);
    expect(pdf.status).toBe(StatusCodes.OK);

    const other = await setup();
    actAs(other.owner);
    const foreign = await api.get(bill.id);
    expect(foreign.status).toBe(StatusCodes.NOT_FOUND);
    expect((await errorOf(foreign)).code).toBe("BILL_NOT_FOUND");
  });

  it("rejects with a reason and frees the rows; a draft can be deleted", async () => {
    const ctx = await setup();
    const rows = await ctx.measure(day(-5), [
      { boqItemId: ctx.excavation.id, quantity: "30" },
    ]);
    const bill = await ctx.draft();
    await api.submit(bill.id);
    const rejected = await api.reject(bill.id, "Measurements disputed");
    expect(rejected.status).toBe(StatusCodes.OK);
    expect(await json<Bill>(rejected)).toMatchObject({
      status: "rejected",
      rejectReason: "Measurements disputed",
    });
    const freed = await prisma.constructionContractsMeasurementRow.findMany({
      where: { id: { in: rows.rowIds } },
    });
    expect(freed.every((row) => row.billId == null)).toBe(true);
    const again = await ctx.draft();
    expect((await api.remove(again.id)).status).toBe(StatusCodes.NO_CONTENT);
    expect((await api.get(again.id)).status).toBe(StatusCodes.NOT_FOUND);
  });

  it("documents every operation in OpenAPI", async () => {
    const document = await json<{ paths: Record<string, unknown> }>(
      getOpenApi(),
    );
    expect(Object.keys(document.paths)).toEqual(
      expect.arrayContaining([
        "/api/construction/contracts/client-bills",
        "/api/construction/contracts/client-bills/contract",
        "/api/construction/contracts/client-bills/contract/update",
        "/api/construction/contracts/client-bills/{id}/approve",
        "/api/construction/contracts/client-bills/{id}/reverse",
        "/api/construction/contracts/client-bills/{id}/pdf",
      ]),
    );
  });
});
