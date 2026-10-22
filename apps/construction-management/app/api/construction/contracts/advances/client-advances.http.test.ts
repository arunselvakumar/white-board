import { prisma } from "@repo/construction-db";
import { StatusCodes } from "http-status-codes";
import { afterEach, describe, expect, it, vi } from "vitest";

import { GET as getInvoiceRoute } from "@/app/api/construction/finance/invoices/[id]/route";
import type { ConstructionFinanceInvoiceResponse } from "@/app/api/construction/finance/invoices/invoice-models";
import type { ListConstructionFinancePartyBalancesResponse } from "@/app/api/construction/finance/parties/party-balance-models";
import { GET as partyBalancesRoute } from "@/app/api/construction/finance/parties/route";
import { POST as cancelPaymentRoute } from "@/app/api/construction/finance/party-payments/[id]/cancel/route";
import type { ConstructionFinancePartyPaymentResponse } from "@/app/api/construction/finance/party-payments/party-payment-models";
import { POST as recordPayment } from "@/app/api/construction/finance/party-payments/route";
import { createMessagingContractDeadlinesHandler } from "@/src/composition/messaging";
import type { Flag } from "@/src/shared-kernel/access";
import { addDays } from "@/src/shared-kernel/calendar-date";
import { newId } from "@/src/shared-kernel/ids";
import type { QueueJob } from "@/src/shared-kernel/queue";
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
import {
  sharedAssign,
  worksheetContractor,
  worksheetDepartment,
} from "@/test/site-work";

import type { ConstructionContractsBoqItemModel } from "../boq/boq-models";
import { POST as createBoqItemRoute } from "../boq/items/route";
import { POST as createSectionRoute } from "../boq/sections/route";
import { POST as approveBillRoute } from "../client-bills/[id]/approve/route";
import { POST as reverseBillRoute } from "../client-bills/[id]/reverse/route";
import { POST as submitBillRoute } from "../client-bills/[id]/submit/route";
import type {
  GetConstructionContractsClientBillResponseModel,
  GetConstructionContractsClientContractResponseModel,
  ListConstructionContractsClientBillsResponseModel,
} from "../client-bills/client-bill-models";
import { GET as overviewRoute } from "../client-bills/contract/advances-retention/route";
import { GET as contractRoute } from "../client-bills/contract/route";
import { POST as updateContractRoute } from "../client-bills/contract/update/route";
import {
  GET as listBillsRoute,
  POST as createBillRoute,
} from "../client-bills/route";
import { POST as addGuaranteeRoute } from "../guarantees/route";
import { POST as releaseRoute } from "../retention-releases/route";
import { POST as approveWorkOrderRoute } from "../work-orders/[id]/approve/route";
import { POST as completionRoute } from "../work-orders/[id]/completion/route";
import { POST as submitWorkOrderRoute } from "../work-orders/[id]/submit/route";
import type { GetConstructionContractsWorkOrderResponseModel } from "../work-orders/work-order-models";
import { POST as createWorkOrderRoute } from "../work-orders/route";
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
type Bill = GetConstructionContractsClientBillResponseModel;
type Invoice = ConstructionFinanceInvoiceResponse;
type Payment = ConstructionFinancePartyPaymentResponse;
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

const day = (offset: number) => addDays(TODAY, offset);

/**
 * The client side of the worked example: a BOQ item of 1,000 cum at ₹400,
 * 5 % retention, 18 % GST (intra-state), and a ₹1,00,000 mobilisation
 * advance received from the Client, recovered at 10 % of each bill.
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
  const projectId = await addProject(ws, by, "Housing Board Block D");
  const clientId = await addClient(ws, by);
  await prisma.constructionProjectsProject.update({
    where: { id: projectId },
    data: {
      role: "contract",
      clientId,
      clientName: "Tamil Nadu Housing Board",
      stateCode: "33",
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
  const section = await json<{ id: string }>(
    await createSectionRoute(
      request(`${CONTRACTS}/boq/sections`, { projectId, title: "Earthwork" }),
    ),
  );
  const item = await json<ConstructionContractsBoqItemModel>(
    await createBoqItemRoute(
      request(`${CONTRACTS}/boq/items`, {
        projectId,
        sectionId: section.id,
        itemNo: "1.1",
        description: "Excavation",
        uomId: cum,
        quantity: "1000",
        rate: 400_00,
      }),
    ),
  );
  const saveTerms = async (extra: Record<string, unknown> = {}) => {
    const current =
      await json<GetConstructionContractsClientContractResponseModel>(
        await contractRoute(
          request(`${CONTRACTS}/client-bills/contract?projectId=${projectId}`),
        ),
      );
    const response = await updateContractRoute(
      request(`${CONTRACTS}/client-bills/contract/update`, {
        projectId,
        expectedUpdatedAt: current.updatedAt ?? undefined,
        retentionPercent: "5",
        sacCode: "9954",
        gstRate: "18",
        dlpMonths: 12,
        ...extra,
      }),
    );
    expect(response.status, JSON.stringify(await response.clone().json())).toBe(
      StatusCodes.OK,
    );
  };
  await saveTerms();

  const advance = async (extra: Record<string, unknown> = {}) => {
    const response = await recordAdvanceRoute(
      request(`${CONTRACTS}/advances`, {
        projectId,
        kind: "mobilisation",
        amount: ADVANCE,
        advanceOn: day(-20),
        recoveryMode: "percent",
        recoveryValue: "10",
        accountId: accounts.bankId,
        mode: "online",
        reference: `RTGS-${String(Math.random()).slice(2, 10)}`,
        ...extra,
      }),
    );
    expect(response.status, JSON.stringify(await response.clone().json())).toBe(
      StatusCodes.CREATED,
    );
    return json<Overview>(response);
  };

  const approvedBill = async () => {
    await measureClientItems(ws, by, {
      projectId,
      measuredOn: day(-5),
      rows: [{ boqItemId: item.id, quantity: "1000" }],
    });
    const created = await createBillRoute(
      request(`${CONTRACTS}/client-bills`, {
        projectId,
        billDate: TODAY,
        measuredUpTo: day(-1),
      }),
    );
    expect(created.status, JSON.stringify(await created.clone().json())).toBe(
      StatusCodes.CREATED,
    );
    const draft = await json<Bill>(created);
    await submitBillRoute(
      request(`${CONTRACTS}/client-bills/${draft.id}/submit`, {}),
      params(draft.id),
    );
    const approved = await approveBillRoute(
      request(`${CONTRACTS}/client-bills/${draft.id}/approve`, {}),
      params(draft.id),
    );
    expect(approved.status, JSON.stringify(await approved.clone().json())).toBe(
      StatusCodes.OK,
    );
    return { draft, bill: await json<Bill>(approved) };
  };

  const overview = async () =>
    json<Overview>(
      await overviewRoute(
        request(
          `${CONTRACTS}/client-bills/contract/advances-retention?projectId=${projectId}`,
        ),
      ),
    );
  const balance = () => partyBalance(ws, "client", clientId, projectId);
  const invoiceOf = async (id: string) =>
    json<Invoice>(
      await getInvoiceRoute(getFrom(`/invoices/${id}`), idParams(id)),
    );
  const receive = (body: Record<string, unknown>) =>
    recordPayment(
      postTo("/party-payments", {
        partyType: "client",
        partyId: clientId,
        projectId,
        direction: "in",
        paymentDate: TODAY,
        accountId: accounts.bankId,
        mode: "online",
        reference: `NEFT-${String(Math.random()).slice(2, 10)}`,
        ...body,
      }),
    );

  return {
    ws,
    by,
    owner,
    projectId,
    clientId,
    ...accounts,
    saveTerms,
    advance,
    approvedBill,
    overview,
    balance,
    invoiceOf,
    receive,
  };
}

type Ctx = Awaited<ReturnType<typeof setup>>;

async function member(ctx: Ctx, permissions: Record<string, Flag[]>) {
  const added = await addMember(ctx.ws, ctx.by, permissions);
  await sharedAssign(added.memberId, ctx.projectId);
  return { userId: added.userId, workspaceId: ctx.ws, role: "member" as const };
}

describe("Advances received on the client contract (CM-1108)", () => {
  it("receives the advance on account, recovers it from the Client Bill and settles the receivable by allocation", async () => {
    const ctx = await setup();
    const recorded = await ctx.advance();
    const advance = recorded.advances[0];
    expect(recorded).toMatchObject({
      side: "client",
      workOrderId: null,
      party: { id: ctx.clientId, name: "Tamil Nadu Housing Board" },
      advances: [
        {
          direction: "received",
          kind: "mobilisation",
          amount: ADVANCE,
          recoveryPercent: "10.00",
          balance: ADVANCE,
        },
      ],
    });
    const paymentId = advance?.payment?.id ?? "";
    // An on-account Payment In: the Company owes the Client ₹1,00,000 until bills use it.
    expect(await ctx.balance()).toBe(BigInt(ADVANCE));

    const { draft, bill } = await ctx.approvedBill();
    expect(draft.deductionLines).toEqual([
      expect.objectContaining({ kind: "retention", amount: RETENTION }),
      expect.objectContaining({
        kind: "mobilisation_recovery",
        amount: RECOVERY,
        advanceId: advance?.id,
      }),
    ]);
    expect(bill).toMatchObject({ gross: GROSS, net: NET });
    const invoiceId = bill.invoiceId ?? "";
    expect(await ctx.invoiceOf(invoiceId)).toMatchObject({
      origin: "ra_bill",
      direction: "receivable",
      amount: INVOICE,
      allocated: RECOVERY,
      balance: NET,
      payments: [{ paymentId, amount: RECOVERY }],
    });
    // +1,00,000 − 4,52,000: the Client owes ₹3,52,000 (₹4,12,000 due − ₹60,000 advance left).
    expect(await ctx.balance()).toBe(-3_52_000_00n);
    expect(
      await prisma.constructionFinancePartyEntry.findMany({
        where: { workspaceId: ctx.ws, partyId: ctx.clientId },
        orderBy: { createdAt: "asc" },
        select: { kind: true, amount: true },
      }),
    ).toEqual([
      { kind: "receipt", amount: BigInt(ADVANCE) },
      { kind: "sales_invoice", amount: -BigInt(INVOICE) },
    ]);

    // The Client pays the net: ₹60,000 of its advance is still with the Company.
    const received = await ctx.receive({
      amount: NET,
      allocations: [{ invoiceId, amount: NET }],
    });
    expect(received.status, JSON.stringify(await received.clone().json())).toBe(
      StatusCodes.CREATED,
    );
    const cash = await json<Payment>(received);
    expect(await ctx.balance()).toBe(60_000_00n);
    const settled = await reverseBillRoute(
      request(`${CONTRACTS}/client-bills/${bill.id}/reverse`, {
        reason: "Rate revised",
      }),
      params(bill.id),
    );
    expect((await errorOf(settled)).code).toBe("BILL_SETTLED");
    await cancelPaymentRoute(
      postTo(`/party-payments/${cash.id}/cancel`, {
        expectedUpdatedAt: cash.updatedAt,
      }),
      idParams(cash.id),
    );
    expect(await ctx.balance()).toBe(-3_52_000_00n);
    const reversed = await reverseBillRoute(
      request(`${CONTRACTS}/client-bills/${bill.id}/reverse`, {
        reason: "Rate revised",
      }),
      params(bill.id),
    );
    expect(reversed.status, JSON.stringify(await reversed.clone().json())).toBe(
      StatusCodes.OK,
    );
    expect(await ctx.balance()).toBe(BigInt(ADVANCE));
    expect((await ctx.overview()).advances[0]).toMatchObject({
      recovered: 0,
      balance: ADVANCE,
    });
  });

  it("releases receivable retention as a receivable invoice and shows the Client's retention less releases", async () => {
    const ctx = await setup();
    await ctx.approvedBill();
    expect((await ctx.overview()).retention).toMatchObject({
      deducted: RETENTION,
      releasable: RETENTION,
      completionSuggestion: 10_000_00,
    });
    const release = (body: Record<string, unknown>) =>
      releaseRoute(
        request(`${CONTRACTS}/retention-releases`, {
          projectId: ctx.projectId,
          releasedOn: TODAY,
          ...body,
        }),
      );
    // The client side's DLP starts at handover.
    expect(
      (await errorOf(await release({ stage: "completion", amount: 1_00 })))
        .code,
    ).toBe("COMPLETION_DATE_REQUIRED");
    await ctx.saveTerms({ handoverOn: day(-3) });
    expect((await ctx.overview()).dlp).toMatchObject({
      startsOn: day(-3),
      months: 12,
      ended: false,
    });
    const before = await ctx.balance();
    const released = await release({ stage: "completion", amount: 10_000_00 });
    expect(released.status, JSON.stringify(await released.clone().json())).toBe(
      StatusCodes.CREATED,
    );
    const row = (await json<Overview>(released)).releases[0];
    expect(row).toMatchObject({ invoice: { number: "RET-1" } });
    expect(await ctx.invoiceOf(row?.invoice?.id ?? "")).toMatchObject({
      origin: "retention_release",
      direction: "receivable",
      party: { type: "client", id: ctx.clientId },
      amount: 10_000_00,
      taxableAmount: null,
      gstAmount: null,
      retentionRelease: { side: "client", workOrderId: null },
    });
    // Receivable retention becomes due: the Client owes ₹10,000 more.
    expect(await ctx.balance()).toBe(before - 10_000_00n);
    const contract =
      await json<GetConstructionContractsClientContractResponseModel>(
        await contractRoute(
          request(
            `${CONTRACTS}/client-bills/contract?projectId=${ctx.projectId}`,
          ),
        ),
      );
    expect(contract.retentionReceivable).toBe(10_000_00);
    const list = await json<ListConstructionContractsClientBillsResponseModel>(
      await listBillsRoute(
        request(`${CONTRACTS}/client-bills?projectId=${ctx.projectId}`),
      ),
    );
    expect(list.retentionReceivable).toBe(10_000_00);
    const balances = await json<Balances>(
      await partyBalancesRoute(
        getFrom("/parties", { partyType: "client", projectId: ctx.projectId }),
      ),
    );
    expect(balances.items[0]).toMatchObject({
      retentionReceivable: 10_000_00,
    });
  });

  it("guards the client side with Client Bills Update and Financial", async () => {
    const ctx = await setup();
    const workOrderOnly = await member(ctx, {
      "contracts.work_orders": ["read", "update", "financial"],
      "finance.parties": ["read", "create"],
    });
    actAs(workOrderOnly);
    const refused = await recordAdvanceRoute(
      request(`${CONTRACTS}/advances`, {
        projectId: ctx.projectId,
        kind: "mobilisation",
        amount: ADVANCE,
        advanceOn: TODAY,
        recoveryMode: "percent",
        recoveryValue: "10",
        accountId: ctx.cashId,
        mode: "cash",
      }),
    );
    expect(refused.status).toBe(StatusCodes.FORBIDDEN);
    const view = await overviewRoute(
      request(
        `${CONTRACTS}/client-bills/contract/advances-retention?projectId=${ctx.projectId}`,
      ),
    );
    expect(view.status).toBe(StatusCodes.FORBIDDEN);
  });
});

describe("contracts.deadlines_due (CM-1108)", () => {
  it("tells each member once a day of the guarantees and DLP ends within 30 days they may see", async () => {
    const ctx = await setup();
    // The client contract's DLP ends within a month of handover.
    await ctx.saveTerms({ handoverOn: day(-5), dlpMonths: 1 });
    await addGuaranteeRoute(
      request(`${CONTRACTS}/guarantees`, {
        projectId: ctx.projectId,
        purpose: "performance",
        number: "BG/C/1",
        bank: "Canara Bank",
        amount: 5_00_000_00,
        issuedOn: day(-100),
        expiresOn: day(60),
      }),
    );
    // A Work Order whose retention guarantee expires in 10 days.
    const cum = await unitNamed(ctx.ws, ctx.by, "cum");
    const departmentId = await worksheetDepartment(ctx.ws, ctx.by, {
      name: "Earthwork",
    });
    const contractorId = await worksheetContractor(ctx.ws, ctx.by, {
      projectIds: [ctx.projectId],
      departmentIds: [departmentId],
      name: "Velan Constructions",
    });
    const created = await json<GetConstructionContractsWorkOrderResponseModel>(
      await createWorkOrderRoute(
        request(`${CONTRACTS}/work-orders`, {
          projectId: ctx.projectId,
          contractorId,
          orderDate: day(-60),
          lines: [
            {
              kind: "non_boq",
              description: "Excavation",
              uomId: cum,
              quantity: "10",
              rate: 100_00,
            },
          ],
          terms: { dlpMonths: 24 },
        }),
      ),
    );
    await submitWorkOrderRoute(
      request(`${CONTRACTS}/work-orders/${created.id}/submit`, {}),
      params(created.id),
    );
    const workOrder =
      await json<GetConstructionContractsWorkOrderResponseModel>(
        await approveWorkOrderRoute(
          request(`${CONTRACTS}/work-orders/${created.id}/approve`, {}),
          params(created.id),
        ),
      );
    await completionRoute(
      request(`${CONTRACTS}/work-orders/${workOrder.id}/completion`, {
        completedOn: day(-1),
      }),
      params(workOrder.id),
    );
    const bg = await addGuaranteeRoute(
      request(`${CONTRACTS}/guarantees`, {
        projectId: ctx.projectId,
        workOrderId: workOrder.id,
        purpose: "retention",
        number: "BG/W/9",
        bank: "State Bank of India",
        amount: 50_000_00,
        issuedOn: day(-30),
        expiresOn: day(10),
      }),
    );
    expect(bg.status, JSON.stringify(await bg.clone().json())).toBe(
      StatusCodes.CREATED,
    );

    const both = await member(ctx, {
      "contracts.work_orders": ["read", "notification"],
      "contracts.client_bills": ["read", "notification"],
    });
    const site = await member(ctx, {
      "contracts.work_orders": ["read", "notification"],
    });
    const accounts = await member(ctx, {
      "contracts.client_bills": ["read", "notification"],
    });
    const quiet = await member(ctx, {
      "contracts.work_orders": ["read"],
      "contracts.client_bills": ["read"],
    });

    const handler = createMessagingContractDeadlinesHandler();
    const job: QueueJob = {
      id: newId(),
      type: "messaging.contract_deadlines",
      workspaceId: null,
      payload: null,
      attempts: 1,
      maxAttempts: 3,
    };
    await handler.run(job, new AbortController().signal);
    await handler.run(job, new AbortController().signal);
    const rows = await prisma.constructionMessagingNotification.findMany({
      where: { workspaceId: ctx.ws, type: "contracts.deadlines_due" },
    });
    const of = (userId: string) =>
      rows.filter((row) => row.recipientUserId === userId);
    expect(of(quiet.userId)).toEqual([]);
    expect(of(ctx.by)).toHaveLength(1);
    expect(of(both.userId)).toMatchObject([
      {
        menu: "contracts.work_orders",
        title:
          "1 bank guarantee expires and 1 DLP ends within 30 days in Housing Board Block D",
        link: { href: `/app/projects/${ctx.projectId}/work-orders` },
      },
    ]);
    expect(of(both.userId)[0]?.body).toContain(
      `Bank guarantee BG/W/9 (State Bank of India) on ${workOrder.number ?? ""} expires`,
    );
    expect(of(both.userId)[0]?.body).toContain(
      "DLP of the client contract ends",
    );
    expect(of(site.userId)).toMatchObject([
      {
        menu: "contracts.work_orders",
        title:
          "1 bank guarantee expires within 30 days in Housing Board Block D",
        link: {
          href: `/app/projects/${ctx.projectId}/work-orders/${workOrder.id}`,
        },
      },
    ]);
    expect(of(accounts.userId)).toMatchObject([
      {
        menu: "contracts.client_bills",
        title: "1 DLP ends within 30 days in Housing Board Block D",
        link: { href: `/app/projects/${ctx.projectId}/client-bills` },
      },
    ]);
  });
});
