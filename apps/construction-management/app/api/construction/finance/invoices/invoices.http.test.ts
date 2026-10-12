import { randomUUID } from "node:crypto";

import { prisma } from "@repo/construction-db";
import { StatusCodes } from "http-status-codes";
import { describe, expect, it, vi } from "vitest";

import { GET as getOpenApi } from "@/app/api/openapi.json/route";
import { addDays } from "@/src/shared-kernel/calendar-date";
import { actAs } from "@/test/companies";
import {
  closeBooks,
  codeOf,
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

import { POST as approveSettlement } from "../settlements/[id]/approve/route";
import { POST as rejectSettlement } from "../settlements/[id]/reject/route";
import { POST as bulkApprove } from "../settlements/bulk-approve/route";
import { GET as listSettlements } from "../settlements/route";
import { POST as removeInvoice } from "./[id]/delete/route";
import { GET as getInvoice } from "./[id]/route";
import { POST as settleInvoice } from "./[id]/settle/route";
import { POST as updateInvoice } from "./[id]/update/route";
import type { ConstructionFinanceInvoiceResponse } from "./invoice-models";
import { GET as listInvoices, POST as createInvoice } from "./route";

vi.mock(import("@repo/auth/construction/server"), async (importOriginal) => ({
  ...(await importOriginal()),
  getCompanyAuthFromHeaders: vi.fn(),
}));

type Invoice = ConstructionFinanceInvoiceResponse;
type Settlement = { id: string; status: string; amount: number };

function supplierBill(world: PartyWorld, patch: Record<string, unknown> = {}) {
  return createInvoice(
    postTo("/invoices", {
      partyType: "supplier",
      partyId: world.supplierId,
      projectId: world.projectId,
      invoiceNumber: `SMT/${randomUUID().slice(0, 6)}`,
      invoiceDate: addDays(TODAY, -5),
      dueDate: addDays(TODAY, 25),
      amount: 1_18_000_00,
      ...patch,
    }),
  );
}

async function bill(world: PartyWorld, patch: Record<string, unknown> = {}) {
  const response = await supplierBill(world, patch);
  expect(response.status).toBe(StatusCodes.CREATED);
  return json<Invoice>(response);
}

async function invoiceOf(id: string): Promise<Invoice> {
  return json<Invoice>(
    await getInvoice(getFrom(`/invoices/${id}`), idParams(id)),
  );
}

async function department(world: PartyWorld, linked: boolean) {
  const id = randomUUID();
  await prisma.constructionMastersDepartment.create({
    data: {
      id,
      workspaceId: world.workspaceId,
      name: `Masonry ${id.slice(0, 6)}`,
      createdBy: world.ownerId,
      updatedBy: world.ownerId,
    },
  });
  if (linked)
    await prisma.constructionMastersContractorDepartment.create({
      data: { contractorId: world.contractorId, departmentId: id },
    });
  return id;
}

describe("Party invoices (CM-705, CM-706, CM-708)", () => {
  it("records a supplier bill, posts it to the party and lists it as open", async () => {
    const world = await partyWorld();
    const invoice = await bill(world, { invoiceNumber: "SMT/118" });
    expect(invoice).toMatchObject({
      party: { type: "supplier", id: world.supplierId },
      place: { kind: "project", id: world.projectId, name: "Tower A" },
      direction: "payable",
      origin: "manual",
      invoiceNumber: "SMT/118",
      amount: 1_18_000_00,
      balance: 1_18_000_00,
      status: "open",
      overdue: false,
      actions: { edit: true, delete: true, settle: true, pay: true },
    });
    expect(
      await partyBalance(
        world.workspaceId,
        "supplier",
        world.supplierId,
        world.projectId,
      ),
    ).toBe(1_18_000_00n);

    // Numbers are unique per party, ignoring case.
    const taken = await supplierBill(world, { invoiceNumber: "smt/118" });
    expect(taken.status).toBe(StatusCodes.CONFLICT);
    expect(await codeOf(taken)).toBe("INVOICE_NUMBER_TAKEN");

    const page = await json<{ items: Invoice[]; total: number }>(
      await listInvoices(
        getFrom("/invoices", {
          projectId: world.projectId,
          partyType: "supplier",
          status: "open",
        }),
      ),
    );
    expect(page.total).toBe(1);
    expect(page.items[0]?.id).toBe(invoice.id);
  });

  it("refuses a due date before the invoice date, a missing number and a party off the Project", async () => {
    const world = await partyWorld();
    const early = await supplierBill(world, {
      invoiceDate: TODAY,
      dueDate: addDays(TODAY, -1),
    });
    expect(await codeOf(early)).toBe("DUE_DATE_BEFORE_INVOICE");
    const noNumber = await supplierBill(world, { invoiceNumber: " " });
    expect(await codeOf(noNumber)).toBe("INVOICE_NUMBER_REQUIRED");

    await prisma.constructionMastersSupplierProject.deleteMany({
      where: { supplierId: world.supplierId, projectId: world.projectId },
    });
    const offProject = await supplierBill(world);
    expect(offProject.status).toBe(StatusCodes.BAD_REQUEST);
    expect(await codeOf(offProject)).toBe("PARTY_NOT_ON_PROJECT");
  });

  it("takes a Contractor's own Department, taxable value and GST", async () => {
    const world = await partyWorld();
    const own = await department(world, true);
    const other = await department(world, false);
    const base = {
      partyType: "contractor",
      partyId: world.contractorId,
      projectId: world.projectId,
      invoiceNumber: "RA-1",
      invoiceDate: TODAY,
      amount: 1_18_000_00,
      taxableAmount: 1_00_000_00,
      gstAmount: 18_000_00,
    };
    const wrong = await createInvoice(
      postTo("/invoices", { ...base, departmentId: other }),
    );
    expect(await codeOf(wrong)).toBe("DEPARTMENT_NOT_OF_CONTRACTOR");
    const split = await createInvoice(
      postTo("/invoices", { ...base, gstAmount: 18_000_01 }),
    );
    expect(await codeOf(split)).toBe("INVOICE_SPLIT_EXCEEDS_AMOUNT");
    const ok = await createInvoice(
      postTo("/invoices", { ...base, departmentId: own }),
    );
    expect(ok.status).toBe(StatusCodes.CREATED);
    expect(await json<Invoice>(ok)).toMatchObject({
      department: { id: own },
      taxableAmount: 1_00_000_00,
      gstAmount: 18_000_00,
    });
  });

  it("numbers an Other Party sales invoice by the INV rule and posts it as owed to the Company", async () => {
    const world = await partyWorld();
    const response = await createInvoice(
      postTo("/invoices", {
        partyType: "other_party",
        partyId: world.otherPartyId,
        projectId: world.projectId,
        direction: "receivable",
        invoiceDate: TODAY,
        amount: 50_000_00,
      }),
    );
    expect(response.status).toBe(StatusCodes.CREATED);
    const invoice = await json<Invoice>(response);
    expect(invoice.invoiceNumber).toMatch(/^INV\//);
    expect(invoice.direction).toBe("receivable");
    expect(
      await partyBalance(
        world.workspaceId,
        "other_party",
        world.otherPartyId,
        world.projectId,
      ),
    ).toBe(-50_000_00n);
    const supplierSale = await createInvoice(
      postTo("/invoices", {
        partyType: "supplier",
        partyId: world.supplierId,
        projectId: world.projectId,
        direction: "receivable",
        invoiceDate: TODAY,
        amount: 100,
      }),
    );
    expect(await codeOf(supplierSale)).toBe(
      "SALES_INVOICE_ONLY_FOR_OTHER_PARTIES",
    );
  });

  it("edits with a reversal, refuses a stale edit and an amount below what is allocated", async () => {
    const world = await partyWorld();
    const invoice = await bill(world, { amount: 1_000_00 });
    const edited = await updateInvoice(
      postTo(`/invoices/${invoice.id}/update`, {
        invoiceNumber: invoice.invoiceNumber,
        invoiceDate: invoice.invoiceDate,
        amount: 1_500_00,
        expectedUpdatedAt: invoice.updatedAt,
      }),
      idParams(invoice.id),
    );
    expect(edited.status).toBe(StatusCodes.OK);
    const after = await json<Invoice>(edited);
    expect(after.amount).toBe(1_500_00);
    const entries = await prisma.constructionFinancePartyEntry.findMany({
      where: { sourceType: "invoice", sourceId: invoice.id },
      orderBy: { createdAt: "asc" },
    });
    expect(entries.map((entry) => entry.amount)).toEqual([
      1_000_00n,
      -1_000_00n,
      1_500_00n,
    ]);

    const stale = await updateInvoice(
      postTo(`/invoices/${invoice.id}/update`, {
        invoiceNumber: invoice.invoiceNumber,
        invoiceDate: invoice.invoiceDate,
        amount: 1_200_00,
        expectedUpdatedAt: invoice.updatedAt,
      }),
      idParams(invoice.id),
    );
    expect(await codeOf(stale)).toBe("INVOICE_CHANGED");

    await prisma.constructionFinancePartyPayment.create({
      data: {
        id: randomUUID(),
        workspaceId: world.workspaceId,
        number: `PAY/${randomUUID().slice(0, 6)}`,
        partyType: "supplier",
        partyId: world.supplierId,
        projectId: world.projectId,
        direction: "out",
        paymentDate: new Date(`${TODAY}T00:00:00.000Z`),
        accountId: world.cashId,
        mode: "cash",
        amount: 1_200_00n,
        createdBy: world.ownerId,
        updatedBy: world.ownerId,
        allocations: {
          create: {
            id: randomUUID(),
            workspaceId: world.workspaceId,
            invoiceId: invoice.id,
            amount: 1_200_00n,
            createdBy: world.ownerId,
          },
        },
      },
    });
    const below = await updateInvoice(
      postTo(`/invoices/${invoice.id}/update`, {
        invoiceNumber: invoice.invoiceNumber,
        invoiceDate: invoice.invoiceDate,
        amount: 1_100_00,
        expectedUpdatedAt: after.updatedAt,
      }),
      idParams(invoice.id),
    );
    expect(below.status).toBe(StatusCodes.CONFLICT);
    expect(await codeOf(below)).toBe("INVOICE_BELOW_ALLOCATED");

    const partly = await invoiceOf(invoice.id);
    expect(partly).toMatchObject({
      status: "partly_paid",
      allocated: 1_200_00,
      balance: 300_00,
      actions: { delete: false },
    });
    const refused = await removeInvoice(
      postTo(`/invoices/${invoice.id}/delete`, {
        expectedUpdatedAt: partly.updatedAt,
      }),
      idParams(invoice.id),
    );
    expect(refused.status).toBe(StatusCodes.CONFLICT);
    expect(await codeOf(refused)).toBe("INVOICE_ALLOCATED");
  });

  it("deletes an unallocated invoice with a reversal", async () => {
    const world = await partyWorld();
    const invoice = await bill(world);
    const deleted = await removeInvoice(
      postTo(`/invoices/${invoice.id}/delete`, {
        expectedUpdatedAt: invoice.updatedAt,
      }),
      idParams(invoice.id),
    );
    expect(deleted.status).toBe(StatusCodes.NO_CONTENT);
    expect(
      await partyBalance(
        world.workspaceId,
        "supplier",
        world.supplierId,
        world.projectId,
      ),
    ).toBe(0n);
    const gone = await getInvoice(
      getFrom(`/invoices/${invoice.id}`),
      idParams(invoice.id),
    );
    expect(gone.status).toBe(StatusCodes.NOT_FOUND);
  });

  it("settles an invoice through approval: write-off entry and Settled status", async () => {
    const world = await partyWorld();
    const invoice = await bill(world, { amount: 10_000_00 });
    const raised = await settleInvoice(
      postTo(`/invoices/${invoice.id}/settle`, { reason: "Short supply" }),
      idParams(invoice.id),
    );
    expect(raised.status).toBe(StatusCodes.CREATED);
    const pending = await json<Invoice>(raised);
    expect(pending.pendingSettlement).toMatchObject({
      amount: 10_000_00,
      reason: "Short supply",
      status: "pending",
    });
    expect(pending.actions.settle).toBe(false);
    const again = await settleInvoice(
      postTo(`/invoices/${invoice.id}/settle`, { reason: "Again" }),
      idParams(invoice.id),
    );
    expect(await codeOf(again)).toBe("SETTLEMENT_PENDING");

    const list = await json<{ items: Settlement[] }>(
      await listSettlements(
        getFrom("/settlements", {
          status: "pending",
          projectId: world.projectId,
        }),
      ),
    );
    const settlementId = list.items[0]?.id ?? "";
    expect(list.items).toHaveLength(1);

    const approved = await approveSettlement(
      postTo(`/settlements/${settlementId}/approve`, {}),
      idParams(settlementId),
    );
    expect(approved.status).toBe(StatusCodes.OK);
    expect(await json<Settlement>(approved)).toMatchObject({
      status: "approved",
      amount: 10_000_00,
    });
    const settled = await invoiceOf(invoice.id);
    expect(settled).toMatchObject({
      status: "settled",
      writtenOff: 10_000_00,
      balance: 0,
      actions: { edit: false, delete: false, settle: false, pay: false },
    });
    const writeOff = await prisma.constructionFinancePartyEntry.findFirst({
      where: { sourceType: "settlement", sourceId: settlementId },
    });
    expect(writeOff).toMatchObject({ kind: "write_off", amount: -10_000_00n });
    expect(
      await partyBalance(
        world.workspaceId,
        "supplier",
        world.supplierId,
        world.projectId,
      ),
    ).toBe(0n);
  });

  it("rejects a settlement with a reason and bulk-approves all or none", async () => {
    const world = await partyWorld();
    const first = await bill(world, { amount: 500_00 });
    const second = await bill(world, { amount: 700_00 });
    const raise = async (id: string) =>
      (
        await json<Invoice>(
          await settleInvoice(
            postTo(`/invoices/${id}/settle`, { reason: "Rounding" }),
            idParams(id),
          ),
        )
      ).pendingSettlement?.id ?? "";
    const a = await raise(first.id);
    const b = await raise(second.id);

    const noReason = await rejectSettlement(
      postTo(`/settlements/${a}/reject`, { reason: " " }),
      idParams(a),
    );
    expect(await codeOf(noReason)).toBe("REASON_REQUIRED");
    const rejected = await rejectSettlement(
      postTo(`/settlements/${a}/reject`, { reason: "Not agreed" }),
      idParams(a),
    );
    expect(await json<Settlement>(rejected)).toMatchObject({
      status: "rejected",
    });
    expect((await invoiceOf(first.id)).status).toBe("open");

    // `a` is no longer pending: the bulk refuses and approves nothing.
    const refused = await bulkApprove(
      postTo("/settlements/bulk-approve", { ids: [a, b] }),
    );
    expect(refused.status).toBe(StatusCodes.CONFLICT);
    expect(await codeOf(refused)).toBe("BULK_DECISION_REFUSED");
    expect((await invoiceOf(second.id)).status).toBe("open");

    const done = await bulkApprove(
      postTo("/settlements/bulk-approve", { ids: [b] }),
    );
    expect(done.status).toBe(StatusCodes.OK);
    expect((await invoiceOf(second.id)).status).toBe("settled");
  });

  it("keeps the Financial Closing Date and the Permission Matrix", async () => {
    const world = await partyWorld();
    await closeBooks(world.workspaceId, world.ownerId, addDays(TODAY, -10));
    const closed = await supplierBill(world, {
      invoiceDate: addDays(TODAY, -10),
      dueDate: null,
    });
    expect(closed.status).toBe(StatusCodes.FORBIDDEN);
    expect(await codeOf(closed)).toBe("FINANCIAL_PERIOD_CLOSED");

    const reader = await partiesMember(world, ["read"]);
    actAs(reader);
    expect((await supplierBill(world)).status).toBe(StatusCodes.FORBIDDEN);
    expect(
      (await listInvoices(getFrom("/invoices", { projectId: world.projectId })))
        .status,
    ).toBe(StatusCodes.OK);

    const elsewhere = await partiesMember(world, ["read", "create"], {
      onProject: false,
    });
    actAs(elsewhere);
    expect((await supplierBill(world)).status).toBe(StatusCodes.FORBIDDEN);

    // A Store's supplier invoices are the Owner's (CM-0017 §14).
    const writer = await partiesMember(world, ["read", "create"]);
    actAs(writer);
    const store = await createInvoice(
      postTo("/invoices", {
        partyType: "supplier",
        partyId: world.supplierId,
        storeId: randomUUID(),
        invoiceNumber: "S-1",
        invoiceDate: TODAY,
        amount: 100,
      }),
    );
    expect(store.status).toBe(StatusCodes.FORBIDDEN);
  });

  it("documents every party money route", async () => {
    const document = await json<{ paths: Record<string, unknown> }>(
      getOpenApi(),
    );
    for (const path of [
      "/api/construction/finance/invoices",
      "/api/construction/finance/invoices/{id}/settle",
      "/api/construction/finance/invoices/awaiting-goods-receipts",
      "/api/construction/finance/party-payments",
      "/api/construction/finance/party-payments/tds-suggestion",
      "/api/construction/finance/party-payments/{id}/apply-advance",
      "/api/construction/finance/party-payments/{id}/receipt",
      "/api/construction/finance/party-openings",
      "/api/construction/finance/settlements/bulk-approve",
      "/api/construction/finance/party-statements",
      "/api/construction/finance/tds",
      "/api/construction/finance/parties",
    ])
      expect(document.paths).toHaveProperty([path]);
  });
});
