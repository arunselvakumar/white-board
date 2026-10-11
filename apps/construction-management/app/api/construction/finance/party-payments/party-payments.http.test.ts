import { randomUUID } from "node:crypto";

import { prisma } from "@repo/construction-db";
import { StatusCodes } from "http-status-codes";
import { describe, expect, it, vi } from "vitest";

import { POST as deleteContractor } from "@/app/api/construction/masters/contractors/[id]/delete/route";
import { financialYearOf } from "@/src/finance/domain/tds-payment";
import { addDays } from "@/src/shared-kernel/calendar-date";
import { actAs } from "@/test/companies";
import { accountBalance } from "@/test/finance";
import {
  closeBooks,
  codeOf,
  contractorTds,
  getFrom,
  idParams,
  json,
  partiesMember,
  partyBalance,
  partyWorld,
  postTo,
  TODAY,
  type PartyWorld,
} from "@/test/party-finance";

import type { ConstructionFinanceInvoiceResponse } from "../invoices/invoice-models";
import { GET as getInvoice } from "../invoices/[id]/route";
import { GET as outstanding } from "../invoices/outstanding/route";
import { POST as createInvoice } from "../invoices/route";
import { POST as removeOpening } from "../party-openings/[id]/delete/route";
import { POST as setOpening } from "../party-openings/route";
import { GET as statementRoute } from "../party-statements/route";
import { GET as balancesRoute } from "../parties/route";
import { GET as tdsLedgerRoute } from "../tds/route";
import { POST as applyAdvance } from "./[id]/apply-advance/route";
import { POST as cancelPayment } from "./[id]/cancel/route";
import { GET as receipt } from "./[id]/receipt/route";
import type { ConstructionFinancePartyPaymentResponse } from "./party-payment-models";
import { GET as listPayments, POST as recordPayment } from "./route";
import { POST as suggestTds } from "./tds-suggestion/route";

vi.mock(import("@repo/auth/construction/server"), async (importOriginal) => ({
  ...(await importOriginal()),
  getCompanyAuthFromHeaders: vi.fn(),
}));

type Invoice = ConstructionFinanceInvoiceResponse;
type Payment = ConstructionFinancePartyPaymentResponse;
type Suggestion = {
  rate: string;
  base: number;
  amount: number;
  reason: string;
  catchUpBase: number;
  payeeKind: string;
  label: string;
};

const FY = financialYearOf(TODAY);

async function invoice(
  world: PartyWorld,
  patch: Record<string, unknown> = {},
): Promise<Invoice> {
  const response = await createInvoice(
    postTo("/invoices", {
      partyType: "supplier",
      partyId: world.supplierId,
      projectId: world.projectId,
      invoiceNumber: `B-${randomUUID().slice(0, 8)}`,
      invoiceDate: addDays(TODAY, -20),
      dueDate: addDays(TODAY, -5),
      amount: 10_000_00,
      ...patch,
    }),
  );
  expect(response.status).toBe(StatusCodes.CREATED);
  return json<Invoice>(response);
}

function pay(world: PartyWorld, patch: Record<string, unknown> = {}) {
  return recordPayment(
    postTo("/party-payments", {
      partyType: "supplier",
      partyId: world.supplierId,
      projectId: world.projectId,
      paymentDate: TODAY,
      accountId: world.cashId,
      mode: "cash",
      amount: 5_000_00,
      ...patch,
    }),
  );
}

async function paid(
  world: PartyWorld,
  patch: Record<string, unknown> = {},
): Promise<Payment> {
  const response = await pay(world, patch);
  if (response.status !== 201)
    throw new Error(
      `Payment refused: ${String(response.status)} ${JSON.stringify(await response.json())}`,
    );
  return json<Payment>(response);
}

async function invoiceOf(id: string): Promise<Invoice> {
  return json<Invoice>(
    await getInvoice(getFrom(`/invoices/${id}`), idParams(id)),
  );
}

async function suggestion(
  world: PartyWorld,
  settled: number,
  patch: Record<string, unknown> = {},
): Promise<Suggestion> {
  const response = await suggestTds(
    postTo("/party-payments/tds-suggestion", {
      contractorId: world.contractorId,
      projectId: world.projectId,
      paymentDate: TODAY,
      settled,
      ...patch,
    }),
  );
  expect(response.status).toBe(StatusCodes.OK);
  return json<Suggestion>(response);
}

function contractorPayment(
  world: PartyWorld,
  patch: Record<string, unknown> = {},
) {
  return paid(world, {
    partyType: "contractor",
    partyId: world.contractorId,
    ...patch,
  });
}

describe("Party payments (CM-705, CM-708)", () => {
  it("settles two invoices with one payment and moves the account and the party", async () => {
    const world = await partyWorld();
    const first = await invoice(world, {
      amount: 3_000_00,
      dueDate: addDays(TODAY, -10),
    });
    const second = await invoice(world, { amount: 4_000_00 });

    const open = await json<{ items: Invoice[] }>(
      await outstanding(
        getFrom("/invoices/outstanding", {
          projectId: world.projectId,
          partyType: "supplier",
          partyId: world.supplierId,
        }),
      ),
    );
    // Oldest due first.
    expect(open.items.map((item) => item.id)).toEqual([first.id, second.id]);
    expect(open.items[0]).toMatchObject({ overdue: true, daysOverdue: 10 });

    const payment = await paid(world, {
      amount: 5_000_00,
      allocations: [
        { invoiceId: first.id, amount: 3_000_00 },
        { invoiceId: second.id, amount: 2_000_00 },
      ],
    });
    expect(payment).toMatchObject({
      party: { type: "supplier", id: world.supplierId },
      direction: "out",
      amount: 5_000_00,
      settled: 5_000_00,
      allocated: 5_000_00,
      unallocated: 0,
      tds: null,
      account: { id: world.cashId, kind: "cash" },
    });
    expect(payment.number).toMatch(/^PAY\//);
    expect(payment.paidBy?.id).toBeDefined();
    expect((await invoiceOf(first.id)).status).toBe("paid");
    expect(await invoiceOf(second.id)).toMatchObject({
      status: "partly_paid",
      balance: 2_000_00,
      payments: [{ paymentId: payment.id, amount: 2_000_00 }],
    });
    expect(await accountBalance(world.workspaceId, world.cashId)).toBe(
      -5_000_00n,
    );
    expect(
      await partyBalance(
        world.workspaceId,
        "supplier",
        world.supplierId,
        world.projectId,
      ),
    ).toBe(2_000_00n);
    const entry = await prisma.constructionFinanceAccountEntry.findFirst({
      where: { sourceType: "party_payment", sourceId: payment.id },
    });
    expect(entry).toMatchObject({
      kind: "payment",
      amount: -5_000_00n,
      counterpartyKind: "supplier",
      counterpartyId: world.supplierId,
      documentNumber: payment.number,
      projectId: world.projectId,
    });

    const page = await json<{ items: Payment[]; total: number }>(
      await listPayments(
        getFrom("/party-payments", {
          projectId: world.projectId,
          partyId: world.supplierId,
        }),
      ),
    );
    expect(page.total).toBe(1);
  });

  it("refuses over-allocation, another party's or Project's invoice and the wrong direction", async () => {
    const world = await partyWorld();
    const own = await invoice(world, { amount: 1_000_00 });
    const elsewhere = await invoice(world, {
      projectId: world.otherProjectId,
      amount: 1_000_00,
    });
    const contractorBill = await invoice(world, {
      partyType: "contractor",
      partyId: world.contractorId,
      amount: 1_000_00,
    });
    const sale = await invoice(world, {
      partyType: "other_party",
      partyId: world.otherPartyId,
      direction: "receivable",
      amount: 1_000_00,
    });

    const refuse = async (
      allocations: { invoiceId: string; amount: number }[],
      code: string,
      patch: Record<string, unknown> = {},
    ) => {
      const response = await pay(world, {
        amount: 500_00,
        allocations,
        ...patch,
      });
      expect(response.status).toBe(StatusCodes.BAD_REQUEST);
      expect(await codeOf(response)).toBe(code);
    };
    await refuse(
      [{ invoiceId: own.id, amount: 600_00 }],
      "ALLOCATION_EXCEEDS_PAYMENT",
    );
    await refuse(
      [{ invoiceId: own.id, amount: 1_200_00 }],
      "ALLOCATION_EXCEEDS_BALANCE",
      { amount: 2_000_00 },
    );
    await refuse(
      [{ invoiceId: contractorBill.id, amount: 100_00 }],
      "ALLOCATION_OTHER_PARTY",
    );
    await refuse(
      [{ invoiceId: elsewhere.id, amount: 100_00 }],
      "ALLOCATION_OTHER_PLACE",
    );
    await refuse(
      [{ invoiceId: sale.id, amount: 100_00 }],
      "ALLOCATION_WRONG_DIRECTION",
      { partyType: "other_party", partyId: world.otherPartyId },
    );
    const supplierIn = await pay(world, { direction: "in" });
    expect(await codeOf(supplierIn)).toBe("PAYMENT_IN_ONLY_FOR_OTHER_PARTIES");
    // Nothing moved.
    expect(await accountBalance(world.workspaceId, world.cashId)).toBe(0n);
  });

  it("keeps the rest as an advance and applies it to a later invoice", async () => {
    const world = await partyWorld();
    const advance = await paid(world, { amount: 2_500_00 });
    expect(advance).toMatchObject({
      unallocated: 2_500_00,
      actions: { applyAdvance: true },
    });
    expect(
      await partyBalance(
        world.workspaceId,
        "supplier",
        world.supplierId,
        world.projectId,
      ),
    ).toBe(-2_500_00n);

    const later = await invoice(world, { amount: 2_000_00 });
    const tooMuch = await applyAdvance(
      postTo(`/party-payments/${advance.id}/apply-advance`, {
        expectedUpdatedAt: advance.updatedAt,
        allocations: [{ invoiceId: later.id, amount: 2_000_01 }],
      }),
      idParams(advance.id),
    );
    expect(await codeOf(tooMuch)).toBe("ALLOCATION_EXCEEDS_BALANCE");
    const applied = await applyAdvance(
      postTo(`/party-payments/${advance.id}/apply-advance`, {
        expectedUpdatedAt: advance.updatedAt,
        allocations: [{ invoiceId: later.id, amount: 2_000_00 }],
      }),
      idParams(advance.id),
    );
    expect(applied.status).toBe(StatusCodes.OK);
    expect(await json<Payment>(applied)).toMatchObject({
      allocated: 2_000_00,
      unallocated: 500_00,
    });
    expect((await invoiceOf(later.id)).status).toBe("paid");
    // No money moved on applying.
    expect(await accountBalance(world.workspaceId, world.cashId)).toBe(
      -2_500_00n,
    );
    const stale = await applyAdvance(
      postTo(`/party-payments/${advance.id}/apply-advance`, {
        expectedUpdatedAt: advance.updatedAt,
        allocations: [{ invoiceId: later.id, amount: 1 }],
      }),
      idParams(advance.id),
    );
    expect(await codeOf(stale)).toBe("PARTY_PAYMENT_CHANGED");
  });

  it("cancels a payment: both ledgers reversed and its invoices open again", async () => {
    const world = await partyWorld();
    const bill = await invoice(world, { amount: 1_000_00 });
    const payment = await paid(world, {
      amount: 1_000_00,
      allocations: [{ invoiceId: bill.id, amount: 1_000_00 }],
    });
    const cancelled = await cancelPayment(
      postTo(`/party-payments/${payment.id}/cancel`, {
        expectedUpdatedAt: payment.updatedAt,
      }),
      idParams(payment.id),
    );
    expect(cancelled.status).toBe(StatusCodes.NO_CONTENT);
    expect(await accountBalance(world.workspaceId, world.cashId)).toBe(0n);
    expect(
      await partyBalance(
        world.workspaceId,
        "supplier",
        world.supplierId,
        world.projectId,
      ),
    ).toBe(1_000_00n);
    expect(await invoiceOf(bill.id)).toMatchObject({
      status: "open",
      allocated: 0,
      payments: [],
    });
    const accountEntries = await prisma.constructionFinanceAccountEntry.count({
      where: { sourceType: "party_payment", sourceId: payment.id },
    });
    expect(accountEntries).toBe(2);
  });

  it("refuses to cancel or record in a closed period", async () => {
    const world = await partyWorld();
    const old = await paid(world, { paymentDate: addDays(TODAY, -30) });
    await closeBooks(world.workspaceId, world.ownerId, addDays(TODAY, -20));
    const cancel = await cancelPayment(
      postTo(`/party-payments/${old.id}/cancel`, {
        expectedUpdatedAt: old.updatedAt,
      }),
      idParams(old.id),
    );
    expect(cancel.status).toBe(StatusCodes.FORBIDDEN);
    expect(await codeOf(cancel)).toBe("FINANCIAL_PERIOD_CLOSED");
    const record = await pay(world, { paymentDate: addDays(TODAY, -25) });
    expect(await codeOf(record)).toBe("FINANCIAL_PERIOD_CLOSED");
  });

  it("checks the mode against the account and refuses a duplicate reference unless confirmed", async () => {
    const world = await partyWorld();
    const mismatch = await pay(world, { accountId: world.bankId });
    expect(await codeOf(mismatch)).toBe("ACCOUNT_MODE_MISMATCH");
    const noCheque = await pay(world, {
      accountId: world.bankId,
      mode: "cheque",
    });
    expect(await codeOf(noCheque)).toBe("CHEQUE_NUMBER_REQUIRED");
    const first = await paid(world, {
      accountId: world.bankId,
      mode: "online",
      reference: "UTR-77812",
    });
    const duplicate = await pay(world, {
      accountId: world.bankId,
      mode: "upi",
      reference: "utr-77812",
    });
    expect(duplicate.status).toBe(StatusCodes.CONFLICT);
    const body = await json<{
      code: string;
      details: { documentNumber: string };
    }>(duplicate);
    expect(body.code).toBe("DUPLICATE_REFERENCE");
    expect(body.details.documentNumber).toBe(first.number);
    const anyway = await pay(world, {
      accountId: world.bankId,
      mode: "upi",
      reference: "utr-77812",
      confirmDuplicateReference: true,
    });
    expect(anyway.status).toBe(StatusCodes.CREATED);
  });

  it("takes Payment In from an Other Party against its sales invoice", async () => {
    const world = await partyWorld();
    const sale = await invoice(world, {
      partyType: "other_party",
      partyId: world.otherPartyId,
      direction: "receivable",
      invoiceNumber: null,
      amount: 20_000_00,
    });
    const received = await paid(world, {
      partyType: "other_party",
      partyId: world.otherPartyId,
      direction: "in",
      accountId: world.bankId,
      mode: "online",
      reference: "NEFT-1",
      amount: 15_000_00,
      allocations: [{ invoiceId: sale.id, amount: 15_000_00 }],
    });
    expect(received).toMatchObject({ direction: "in", settled: 15_000_00 });
    expect(await accountBalance(world.workspaceId, world.bankId)).toBe(
      15_000_00n,
    );
    expect(
      await partyBalance(
        world.workspaceId,
        "other_party",
        world.otherPartyId,
        world.projectId,
      ),
    ).toBe(-5_000_00n);
    expect(await invoiceOf(sale.id)).toMatchObject({
      status: "partly_paid",
      balance: 5_000_00,
    });
    const pdf = await receipt(
      getFrom(`/party-payments/${received.id}/receipt`),
      idParams(received.id),
    );
    expect(pdf.status).toBe(StatusCodes.OK);
    expect(pdf.headers.get("content-type")).toBe("application/pdf");
    const bytes = new Uint8Array(await pdf.arrayBuffer());
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe("%PDF-");
  });

  it("refuses a party off the Project and members without the right", async () => {
    const world = await partyWorld();
    await prisma.constructionMastersSupplierProject.deleteMany({
      where: { supplierId: world.supplierId, projectId: world.projectId },
    });
    expect(await codeOf(await pay(world))).toBe("PARTY_NOT_ON_PROJECT");

    const reader = await partiesMember(world, ["read"]);
    actAs(reader);
    expect(
      (
        await pay(world, {
          partyType: "contractor",
          partyId: world.contractorId,
        })
      ).status,
    ).toBe(StatusCodes.FORBIDDEN);
    const writer = await partiesMember(world, ["read", "create"]);
    actAs(writer);
    // A member uses only their own petty cash; company accounts are fine.
    const ok = await pay(world, {
      partyType: "contractor",
      partyId: world.contractorId,
      amount: 100_00,
    });
    expect(ok.status).toBe(StatusCodes.CREATED);
    const created = await json<Payment>(ok);
    expect(created.actions.cancel).toBe(false);
    const cancel = await cancelPayment(
      postTo(`/party-payments/${created.id}/cancel`, {
        expectedUpdatedAt: created.updatedAt,
      }),
      idParams(created.id),
    );
    expect(cancel.status).toBe(StatusCodes.FORBIDDEN);
  });

  it("keeps a Contractor with payments from being deleted", async () => {
    const world = await partyWorld();
    await contractorPayment(world, { amount: 100_00 });
    await prisma.constructionMastersContractorProject.deleteMany({
      where: { contractorId: world.contractorId },
    });
    const contractor =
      await prisma.constructionMastersContractor.findUniqueOrThrow({
        where: { id: world.contractorId },
      });
    const response = await deleteContractor(
      new Request(
        `http://localhost/api/construction/masters/contractors/${world.contractorId}/delete`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            expectedUpdatedAt: contractor.updatedAt.toISOString(),
          }),
        },
      ),
      idParams(world.contractorId),
    );
    expect(response.status).toBe(StatusCodes.CONFLICT);
    expect(await codeOf(response)).toBe("CONTRACTOR_IN_USE");
  });
});

describe("TDS 194C on Contractor payments (CM-706)", () => {
  it("suggests by threshold, payee kind, lower rate and GST share", async () => {
    const world = await partyWorld();
    expect(await suggestion(world, 20_000_00)).toMatchObject({
      reason: "below_threshold",
      amount: 0,
      payeeKind: "individual_huf",
    });
    expect(await suggestion(world, 50_000_00)).toMatchObject({
      reason: "single",
      rate: "1.00",
      base: 50_000_00,
      amount: 500_00,
    });

    await contractorTds(world.contractorId, { pan: null });
    expect(await suggestion(world, 50_000_00)).toMatchObject({
      payeeKind: "no_pan",
      rate: "20.00",
      amount: 10_000_00,
    });
    await contractorTds(world.contractorId, {
      pan: "ABCFK1234F",
      tdsLowerRate: "0.50",
    });
    expect(await suggestion(world, 50_000_00)).toMatchObject({
      payeeKind: "other",
      rate: "0.50",
      amount: 250_00,
    });
    await contractorTds(world.contractorId, {
      pan: "ABCPK1234F",
      tdsLowerRate: null,
    });

    const bill = await invoice(world, {
      partyType: "contractor",
      partyId: world.contractorId,
      amount: 1_18_000_00,
      taxableAmount: 1_00_000_00,
      gstAmount: 18_000_00,
    });
    // ₹59,000 of a ₹1,18,000 bill carries ₹9,000 of GST.
    expect(
      await suggestion(world, 59_000_00, {
        allocations: [{ invoiceId: bill.id, amount: 59_000_00 }],
      }),
    ).toMatchObject({ reason: "single", base: 50_000_00, amount: 500_00 });

    await contractorTds(world.contractorId, { tdsApplicable: false });
    expect(await suggestion(world, 50_000_00)).toMatchObject({
      reason: "not_applicable",
      amount: 0,
    });
  });

  it("catches up the year's undeducted base on the payment that crosses ₹1,00,000, across Projects", async () => {
    const world = await partyWorld();
    await contractorPayment(world, { amount: 20_000_00 });
    await contractorPayment(world, {
      projectId: world.otherProjectId,
      amount: 25_000_00,
    });
    await contractorPayment(world, { amount: 28_000_00 });
    const crossing = await suggestion(world, 40_000_00);
    expect(crossing).toMatchObject({
      reason: "aggregate_crossed",
      catchUpBase: 73_000_00,
      base: 1_13_000_00,
      amount: 1_130_00,
    });
    const crossed = await contractorPayment(world, {
      amount: 40_000_00 - 1_130_00,
      tdsAmount: 1_130_00,
    });
    expect(crossed.tds).toMatchObject({
      amount: 1_130_00,
      suggested: 1_130_00,
      base: 1_13_000_00,
      overridden: false,
    });
    // Above the aggregate now: every payment attracts TDS.
    expect(await suggestion(world, 10_000_00)).toMatchObject({
      reason: "aggregate",
      amount: 100_00,
    });
  });

  it("needs a reason to override, moves the account by paid and the party by paid + TDS", async () => {
    const world = await partyWorld();
    const bill = await invoice(world, {
      partyType: "contractor",
      partyId: world.contractorId,
      amount: 1_00_000_00,
    });
    const allocations = [{ invoiceId: bill.id, amount: 1_00_000_00 }];
    const missing = await pay(world, {
      partyType: "contractor",
      partyId: world.contractorId,
      accountId: world.bankId,
      mode: "online",
      reference: "UTR-1",
      amount: 1_00_000_00,
      tdsAmount: 0,
      allocations,
    });
    expect(missing.status).toBe(StatusCodes.BAD_REQUEST);
    expect(await codeOf(missing)).toBe("TDS_OVERRIDE_REASON_REQUIRED");

    const payment = await contractorPayment(world, {
      accountId: world.bankId,
      mode: "online",
      reference: "UTR-2",
      amount: 99_000_00,
      tdsAmount: 1_000_00,
      allocations,
    });
    expect(payment).toMatchObject({
      settled: 1_00_000_00,
      tds: {
        section: "194C",
        rate: "1.00",
        amount: 1_000_00,
        overridden: false,
      },
    });
    expect((await invoiceOf(bill.id)).status).toBe("paid");
    expect(await accountBalance(world.workspaceId, world.bankId)).toBe(
      -99_000_00n,
    );
    const kinds = await prisma.constructionFinancePartyEntry.findMany({
      where: { sourceType: "party_payment", sourceId: payment.id },
      orderBy: { kind: "asc" },
    });
    expect(kinds.map((entry) => [entry.kind, entry.amount])).toEqual([
      ["payment", -99_000_00n],
      ["tds", -1_000_00n],
    ]);
    expect(
      await partyBalance(
        world.workspaceId,
        "contractor",
        world.contractorId,
        world.projectId,
      ),
    ).toBe(0n);

    const overridden = await contractorPayment(world, {
      amount: 49_500_00,
      tdsAmount: 250_00,
      tdsRate: "0.5",
      tdsOverrideReason: "Section 197 certificate received",
    });
    expect(overridden.tds).toMatchObject({
      amount: 250_00,
      rate: "0.50",
      overridden: true,
      overrideReason: "Section 197 certificate received",
    });
    const supplierTds = await pay(world, { tdsAmount: 100_00 });
    expect(await codeOf(supplierTds)).toBe("TDS_ONLY_FOR_CONTRACTORS");
  });

  it("lists the TDS ledger with quarter totals", async () => {
    const world = await partyWorld();
    const q1 = `${String(FY)}-05-10`;
    const q2 = `${String(FY)}-08-10`;
    await contractorPayment(world, {
      paymentDate: q1,
      amount: 49_500_00,
      tdsAmount: 500_00,
    });
    await contractorPayment(world, {
      paymentDate: q2,
      amount: 59_400_00,
      tdsAmount: 600_00,
    });
    const response = await tdsLedgerRoute(
      getFrom("/tds", { contractorId: world.contractorId, fy: String(FY) }),
    );
    expect(response.status).toBe(StatusCodes.OK);
    const ledger = await json<{
      rows: { tds: number; overridden: boolean; project: { name: string } }[];
      quarters: { quarter: number; tds: number; base: number }[];
      totals: { tds: number };
    }>(response);
    expect(ledger.rows).toHaveLength(2);
    expect(ledger.rows[0]).toMatchObject({
      tds: 500_00,
      overridden: false,
      project: { name: "Tower A" },
    });
    expect(ledger.quarters.map((quarter) => quarter.tds)).toEqual([
      500_00, 600_00, 0, 0,
    ]);
    expect(ledger.quarters[1]?.base).toBe(60_000_00);
    expect(ledger.totals.tds).toBe(1_100_00);
  });
});

describe("Openings, statements and balances (CM-705)", () => {
  it("sets, changes and removes an opening with reversals", async () => {
    const world = await partyWorld();
    const body = {
      partyType: "supplier",
      partyId: world.supplierId,
      projectId: world.projectId,
      asOfDate: "2026-03-31",
      amount: 12_000_00,
    };
    const set = await setOpening(postTo("/party-openings", body));
    expect(set.status).toBe(StatusCodes.OK);
    const opening = await json<{ id: string; updatedAt: string }>(set);
    const exists = await setOpening(postTo("/party-openings", body));
    expect(await codeOf(exists)).toBe("PARTY_OPENING_EXISTS");
    const changed = await setOpening(
      postTo("/party-openings", {
        ...body,
        amount: -3_000_00,
        expectedUpdatedAt: opening.updatedAt,
      }),
    );
    expect(changed.status).toBe(StatusCodes.OK);
    expect(
      await partyBalance(
        world.workspaceId,
        "supplier",
        world.supplierId,
        world.projectId,
      ),
    ).toBe(-3_000_00n);
    const after = await json<{ id: string; updatedAt: string }>(changed);
    const removed = await removeOpening(
      postTo(`/party-openings/${after.id}/delete`, {
        expectedUpdatedAt: after.updatedAt,
      }),
      idParams(after.id),
    );
    expect(removed.status).toBe(StatusCodes.NO_CONTENT);
    expect(
      await partyBalance(
        world.workspaceId,
        "supplier",
        world.supplierId,
        world.projectId,
      ),
    ).toBe(0n);
  });

  it("builds a statement with running balance and the balances table", async () => {
    const world = await partyWorld();
    await setOpening(
      postTo("/party-openings", {
        partyType: "supplier",
        partyId: world.supplierId,
        projectId: world.projectId,
        asOfDate: addDays(TODAY, -60),
        amount: 1_000_00,
      }),
    );
    const bill = await invoice(world, {
      amount: 5_000_00,
      invoiceDate: addDays(TODAY, -30),
      dueDate: addDays(TODAY, -15),
    });
    const payment = await paid(world, {
      amount: 2_000_00,
      allocations: [{ invoiceId: bill.id, amount: 2_000_00 }],
    });

    const statement = await json<{
      opening: number;
      closing: number;
      lines: {
        kind: string;
        amount: number;
        balance: number;
        document: { number: string | null };
      }[];
      openInvoices: { id: string }[];
    }>(
      await statementRoute(
        getFrom("/party-statements", {
          partyType: "supplier",
          partyId: world.supplierId,
          projectId: world.projectId,
          from: addDays(TODAY, -40),
        }),
      ),
    );
    expect(statement.opening).toBe(1_000_00);
    expect(
      statement.lines.map((line) => [line.kind, line.amount, line.balance]),
    ).toEqual([
      ["invoice", 5_000_00, 6_000_00],
      ["payment", -2_000_00, 4_000_00],
    ]);
    expect(statement.lines[1]?.document.number).toBe(payment.number);
    expect(statement.closing).toBe(4_000_00);
    expect(statement.openInvoices.map((item) => item.id)).toEqual([bill.id]);

    const balances = await json<{
      items: {
        party: { id: string };
        opening: number;
        invoiced: number;
        paid: number;
        balance: number;
        overdue: number;
        assigned: boolean;
      }[];
      totals: { balance: number };
    }>(
      await balancesRoute(
        getFrom("/parties", {
          partyType: "supplier",
          projectId: world.projectId,
        }),
      ),
    );
    expect(
      balances.items.find((row) => row.party.id === world.supplierId),
    ).toMatchObject({
      assigned: true,
      opening: 1_000_00,
      invoiced: 5_000_00,
      paid: 2_000_00,
      balance: 4_000_00,
      overdue: 3_000_00,
    });
    expect(balances.totals.balance).toBe(4_000_00);
  });
});
