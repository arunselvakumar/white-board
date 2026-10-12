import { randomUUID } from "node:crypto";

import { prisma } from "@repo/construction-db";

import { seededAccounts } from "@/test/finance";

/**
 * Finance document rows for the thread's HTTP tests, written straight to
 * `construction_finance` (each ticket's own tests create them through its
 * routes).
 */

const day = new Date("2026-10-08T00:00:00.000Z");

function audit(by: string) {
  return { createdBy: by, updatedBy: by };
}

let counter = 0;

function number(prefix: string): string {
  counter += 1;
  return `${prefix}/26-27/${String(counter).padStart(5, "0")}`;
}

/** A pending Payment Out from the Company's Cash Account. */
export async function addTransactionRow(
  workspaceId: string,
  by: string,
  projectId: string | null,
): Promise<{ id: string; number: string }> {
  const { cashId } = await seededAccounts(workspaceId);
  const id = randomUUID();
  const row = await prisma.constructionFinanceTransaction.create({
    data: {
      id,
      workspaceId,
      number: number("TXN"),
      projectId,
      transactionDate: day,
      type: "payment_out",
      accountId: cashId,
      mode: "cash",
      amount: 150_000n,
      ...audit(by),
    },
  });
  return { id, number: row.number };
}

/** A petty-cash account for a Team Member (no entries). */
export async function addPettyCashAccountRow(
  workspaceId: string,
  by: string,
  holderMemberId: string,
): Promise<string> {
  const id = randomUUID();
  await prisma.constructionFinanceAccount.create({
    data: {
      id,
      workspaceId,
      kind: "petty_cash",
      name: `Petty cash ${id.slice(-6)}`,
      holderMemberId,
      openingDate: day,
      ...audit(by),
    },
  });
  return id;
}

/** A pending Payment voucher on a petty-cash account. */
export async function addVoucherRow(
  workspaceId: string,
  by: string,
  accountId: string,
  projectId: string | null,
): Promise<{ id: string; number: string }> {
  const category = await prisma.constructionFinancePaymentCategory.findFirst({
    where: { workspaceId, deletedAt: null },
    select: { id: true },
  });
  if (category == null) throw new Error("The Company has no categories.");
  const id = randomUUID();
  const row = await prisma.constructionFinancePettyCashVoucher.create({
    data: {
      id,
      workspaceId,
      number: number("PC"),
      accountId,
      voucherType: "payment",
      voucherDate: day,
      projectId,
      paymentCategoryId: category.id,
      counterpartyName: "Tea stall",
      amount: 25_000n,
      ...audit(by),
    },
  });
  return { id, number: row.number };
}

/** A supplier invoice on a Project or at a Store. */
export async function addInvoiceRow(
  workspaceId: string,
  by: string,
  place: { projectId: string } | { storeId: string },
): Promise<{ id: string; invoiceNumber: string }> {
  const id = randomUUID();
  const invoiceNumber = `SI-${String(Math.floor(Math.random() * 1e6))}`;
  await prisma.constructionFinanceInvoice.create({
    data: {
      id,
      workspaceId,
      partyType: "supplier",
      partyId: randomUUID(),
      projectId: "projectId" in place ? place.projectId : null,
      storeId: "storeId" in place ? place.storeId : null,
      direction: "payable",
      invoiceNumber,
      invoiceDate: day,
      amount: 1_00_000_00n,
      ...audit(by),
    },
  });
  return { id, invoiceNumber };
}

/** A pending settlement of an invoice. */
export async function addSettlementRow(
  workspaceId: string,
  by: string,
  invoiceId: string,
): Promise<string> {
  const id = randomUUID();
  await prisma.constructionFinanceSettlement.create({
    data: {
      id,
      workspaceId,
      invoiceId,
      amount: 500_00n,
      reason: "Rounding off the last bill",
      ...audit(by),
    },
  });
  return id;
}

/** Tombstones a finance document row. */
export async function deleteFinanceRow(
  type: "transaction" | "petty_cash_voucher",
  id: string,
): Promise<void> {
  const data = { deletedAt: new Date(), deletedBy: "test" };
  if (type === "transaction")
    await prisma.constructionFinanceTransaction.update({ where: { id }, data });
  else
    await prisma.constructionFinancePettyCashVoucher.update({
      where: { id },
      data,
    });
}
