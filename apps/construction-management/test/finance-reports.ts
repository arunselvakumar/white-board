import { randomUUID } from "node:crypto";

import { Prisma, prisma } from "@repo/construction-db";

import type {
  AccountEntryKind,
  AccountEntrySource,
  CounterpartyKind,
  PaymentMode,
  PartyType,
} from "@/src/finance/domain/ledger";
import { accountLedger } from "@/src/finance/infrastructure/account-ledger";
import { partyLedger } from "@/src/finance/infrastructure/party-ledger";
import { calendarDateToDb } from "@/src/shared-kernel/calendar-date";

/**
 * Finance rows for the CM-709 report, dashboard and Central Payment tests,
 * written straight to the tables with the ledger writers: the read side is
 * tested on the tables, never on the write-side handlers (built in
 * parallel by other tickets).
 */

type Status = "pending" | "approved" | "rejected";

function audit(by: string) {
  const now = new Date();
  return { createdAt: now, updatedAt: now, createdBy: by, updatedBy: by };
}

let counter = 0;
function number(prefix: string): string {
  counter += 1;
  return `${prefix}/26-27/${String(counter).padStart(5, "0")}-${randomUUID().slice(0, 4)}`;
}

/** One account entry; returns its id (look it up by source). */
export async function reportEntry(
  workspaceId: string,
  by: string,
  input: {
    accountId: string;
    date: string;
    amount: bigint;
    kind?: AccountEntryKind;
    sourceType?: AccountEntrySource;
    sourceId?: string;
    projectId?: string | null;
    mode?: PaymentMode | null;
    reference?: string | null;
    paymentCategoryId?: string | null;
    counterpartyKind?: CounterpartyKind | null;
    counterpartyName?: string | null;
    documentNumber?: string | null;
    narration?: string | null;
  },
): Promise<string> {
  const sourceId = input.sourceId ?? randomUUID();
  const sourceType = input.sourceType ?? "transaction";
  await prisma.$transaction((tx) =>
    accountLedger.post(tx, workspaceId, by, [
      {
        accountId: input.accountId,
        projectId: input.projectId ?? null,
        entryDate: input.date,
        kind: input.kind ?? (input.amount > 0n ? "receipt" : "payment"),
        amount: input.amount,
        mode: input.mode ?? "cash",
        reference: input.reference ?? null,
        paymentCategoryId: input.paymentCategoryId ?? null,
        counterpartyKind: input.counterpartyKind ?? null,
        counterpartyName: input.counterpartyName ?? null,
        documentNumber: input.documentNumber ?? null,
        narration: input.narration ?? null,
        sourceType,
        sourceId,
      },
    ]),
  );
  const row = await prisma.constructionFinanceAccountEntry.findFirstOrThrow({
    where: { workspaceId, sourceType, sourceId, reversesEntryId: null },
    orderBy: { createdAt: "desc" },
  });
  return row.id;
}

/** Reverses every live entry a source wrote (an edit or a cancel). */
export async function reportReverse(
  workspaceId: string,
  by: string,
  sourceType: AccountEntrySource,
  sourceId: string,
): Promise<void> {
  await prisma.$transaction((tx) =>
    accountLedger.reverseSource(tx, workspaceId, by, sourceType, sourceId),
  );
}

export async function reportCategory(
  workspaceId: string,
  by: string,
  name = `Category ${randomUUID().slice(0, 6)}`,
): Promise<string> {
  const id = randomUUID();
  await prisma.constructionFinancePaymentCategory.create({
    data: { id, workspaceId, name, ...audit(by) },
  });
  return id;
}

export async function reportOtherParty(
  workspaceId: string,
  by: string,
  name = `Other party ${randomUUID().slice(0, 6)}`,
): Promise<string> {
  const id = randomUUID();
  await prisma.constructionFinanceOtherParty.create({
    data: { id, workspaceId, name, ...audit(by) },
  });
  return id;
}

/** A party's opening balance on a Project (+ owed to the party). */
export async function reportPartyOpening(
  workspaceId: string,
  by: string,
  input: {
    partyType: PartyType;
    partyId: string;
    projectId: string;
    date: string;
    amount: bigint;
  },
): Promise<void> {
  const id = randomUUID();
  await prisma.$transaction(async (tx) => {
    await tx.constructionFinancePartyOpening.create({
      data: {
        id,
        workspaceId,
        partyType: input.partyType,
        partyId: input.partyId,
        projectId: input.projectId,
        asOfDate: calendarDateToDb(input.date),
        amount: input.amount,
        ...audit(by),
      },
    });
    await partyLedger.post(tx, workspaceId, by, [
      {
        partyType: input.partyType,
        partyId: input.partyId,
        projectId: input.projectId,
        entryDate: input.date,
        kind: "opening",
        amount: input.amount,
        sourceType: "party_opening",
        sourceId: id,
      },
    ]);
  });
}

/** An invoice with its party entry (+ for a bill from the party). */
export async function reportInvoice(
  workspaceId: string,
  by: string,
  input: {
    partyType: PartyType;
    partyId: string;
    projectId: string;
    date: string;
    dueDate?: string | null;
    amount: bigint;
    direction?: "payable" | "receivable";
    number?: string;
  },
): Promise<string> {
  const id = randomUUID();
  const direction = input.direction ?? "payable";
  await prisma.$transaction(async (tx) => {
    await tx.constructionFinanceInvoice.create({
      data: {
        id,
        workspaceId,
        partyType: input.partyType,
        partyId: input.partyId,
        projectId: input.projectId,
        direction,
        invoiceNumber: input.number ?? number("BILL"),
        invoiceDate: calendarDateToDb(input.date),
        dueDate: input.dueDate == null ? null : calendarDateToDb(input.dueDate),
        amount: input.amount,
        ...audit(by),
      },
    });
    await partyLedger.post(tx, workspaceId, by, [
      {
        partyType: input.partyType,
        partyId: input.partyId,
        projectId: input.projectId,
        entryDate: input.date,
        kind: direction === "payable" ? "invoice" : "sales_invoice",
        amount: direction === "payable" ? input.amount : -input.amount,
        invoiceId: id,
        sourceType: "invoice",
        sourceId: id,
      },
    ]);
  });
  return id;
}

/**
 * A party payment out (or in, for an Other Party) with its allocations,
 * party entries (payment and TDS) and account entry (the money only).
 */
export async function reportPartyPayment(
  workspaceId: string,
  by: string,
  input: {
    partyType: PartyType;
    partyId: string;
    projectId: string;
    accountId: string;
    date: string;
    amount: bigint;
    tds?: {
      amount: bigint;
      base: bigint;
      rate: string;
      suggested?: bigint;
      reason?: string;
    };
    allocations?: { invoiceId: string; amount: bigint }[];
    direction?: "out" | "in";
    mode?: PaymentMode;
    number?: string;
    partyName?: string;
  },
): Promise<string> {
  const id = randomUUID();
  const direction = input.direction ?? "out";
  const tds = input.tds?.amount ?? 0n;
  const paymentNumber = input.number ?? number("PAY");
  const mode = input.mode ?? "cash";
  await prisma.$transaction(async (tx) => {
    await tx.constructionFinancePartyPayment.create({
      data: {
        id,
        workspaceId,
        number: paymentNumber,
        partyType: input.partyType,
        partyId: input.partyId,
        projectId: input.projectId,
        direction,
        paymentDate: calendarDateToDb(input.date),
        accountId: input.accountId,
        mode,
        chequeNumber: mode === "cheque" ? "000123" : null,
        reference: mode === "online" || mode === "upi" ? "UTR123" : null,
        amount: input.amount,
        tdsSection: input.tds == null ? null : "194C",
        tdsBase: input.tds?.base ?? null,
        tdsRate: input.tds == null ? null : new Prisma.Decimal(input.tds.rate),
        tdsAmount: tds,
        tdsSuggested: input.tds?.suggested ?? (input.tds == null ? null : tds),
        tdsOverrideReason: input.tds?.reason ?? null,
        ...audit(by),
      },
    });
    for (const allocation of input.allocations ?? [])
      await tx.constructionFinancePaymentAllocation.create({
        data: {
          id: randomUUID(),
          workspaceId,
          paymentId: id,
          invoiceId: allocation.invoiceId,
          amount: allocation.amount,
          createdBy: by,
        },
      });
    const out = direction === "out";
    await partyLedger.post(tx, workspaceId, by, [
      {
        partyType: input.partyType,
        partyId: input.partyId,
        projectId: input.projectId,
        entryDate: input.date,
        kind: out ? "payment" : "receipt",
        amount: out ? -input.amount : input.amount,
        sourceType: "party_payment",
        sourceId: id,
      },
      {
        partyType: input.partyType,
        partyId: input.partyId,
        projectId: input.projectId,
        entryDate: input.date,
        kind: "tds",
        amount: -tds,
        sourceType: "party_payment",
        sourceId: id,
      },
    ]);
    await accountLedger.post(tx, workspaceId, by, [
      {
        accountId: input.accountId,
        projectId: input.projectId,
        entryDate: input.date,
        kind: out ? "payment" : "receipt",
        amount: out ? -input.amount : input.amount,
        mode,
        counterpartyKind: input.partyType,
        counterpartyId: input.partyId,
        counterpartyName: input.partyName ?? null,
        documentNumber: paymentNumber,
        sourceType: "party_payment",
        sourceId: id,
      },
    ]);
  });
  return id;
}

/** Cancels a party payment: reversals, allocations freed, tombstone. */
export async function reportCancelPayment(
  workspaceId: string,
  by: string,
  paymentId: string,
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await partyLedger.reverseSource(
      tx,
      workspaceId,
      by,
      "party_payment",
      paymentId,
    );
    await accountLedger.reverseSource(
      tx,
      workspaceId,
      by,
      "party_payment",
      paymentId,
    );
    await tx.constructionFinancePaymentAllocation.updateMany({
      where: { paymentId },
      data: { deletedAt: new Date(), deletedBy: by },
    });
    await tx.constructionFinancePartyPayment.update({
      where: { id: paymentId },
      data: { deletedAt: new Date(), deletedBy: by },
    });
  });
}

/** A settlement of an invoice; approved posts the write-off and marks it Settled. */
export async function reportSettlement(
  workspaceId: string,
  by: string,
  input: {
    invoiceId: string;
    amount: bigint;
    status?: Status;
    date?: string;
  },
): Promise<string> {
  const id = randomUUID();
  const status = input.status ?? "pending";
  await prisma.$transaction(async (tx) => {
    const invoice = await tx.constructionFinanceInvoice.findUniqueOrThrow({
      where: { id: input.invoiceId },
    });
    await tx.constructionFinanceSettlement.create({
      data: {
        id,
        workspaceId,
        invoiceId: input.invoiceId,
        amount: input.amount,
        reason: "Short supply",
        approvalStatus: status,
        rejectReason: status === "rejected" ? "No" : null,
        ...audit(by),
      },
    });
    if (status !== "approved") return;
    await partyLedger.post(tx, workspaceId, by, [
      {
        partyType: invoice.partyType,
        partyId: invoice.partyId,
        projectId: invoice.projectId,
        entryDate: input.date ?? "2026-09-30",
        kind: "write_off",
        amount: invoice.direction === "payable" ? -input.amount : input.amount,
        invoiceId: invoice.id,
        sourceType: "settlement",
        sourceId: id,
      },
    ]);
    await tx.constructionFinanceInvoice.update({
      where: { id: invoice.id },
      data: { settledAt: new Date(`${input.date ?? "2026-09-30"}T06:00:00Z`) },
    });
  });
  return id;
}

/** A Transaction; an approved one posts its entry. */
export async function reportTransaction(
  workspaceId: string,
  by: string,
  input: {
    accountId: string;
    projectId: string | null;
    date: string;
    amount: bigint;
    type?: "payment_in" | "payment_out";
    status?: Status;
    categoryId?: string | null;
    counterpartyName?: string | null;
  },
): Promise<string> {
  const id = randomUUID();
  const status = input.status ?? "approved";
  const type = input.type ?? "payment_out";
  const txn = number("TXN");
  await prisma.constructionFinanceTransaction.create({
    data: {
      id,
      workspaceId,
      number: txn,
      projectId: input.projectId,
      transactionDate: calendarDateToDb(input.date),
      type,
      accountId: input.accountId,
      paymentCategoryId: input.categoryId ?? null,
      mode: "cash",
      counterpartyName: input.counterpartyName ?? null,
      amount: input.amount,
      approvalStatus: status,
      rejectReason: status === "rejected" ? "Wrong" : null,
      ...audit(by),
    },
  });
  if (status === "approved")
    await reportEntry(workspaceId, by, {
      accountId: input.accountId,
      projectId: input.projectId,
      date: input.date,
      amount: type === "payment_in" ? input.amount : -input.amount,
      sourceType: "transaction",
      sourceId: id,
      documentNumber: txn,
      paymentCategoryId: input.categoryId ?? null,
      counterpartyName: input.counterpartyName ?? null,
    });
  return id;
}

/** A transfer between two accounts; an approved one posts both entries. */
export async function reportTransfer(
  workspaceId: string,
  by: string,
  input: {
    fromAccountId: string;
    toAccountId: string;
    projectId: string | null;
    date: string;
    amount: bigint;
    status?: Status;
  },
): Promise<string> {
  const id = randomUUID();
  const status = input.status ?? "approved";
  await prisma.constructionFinanceAccountTransfer.create({
    data: {
      id,
      workspaceId,
      number: number("TXN"),
      projectId: input.projectId,
      transferDate: calendarDateToDb(input.date),
      fromAccountId: input.fromAccountId,
      toAccountId: input.toAccountId,
      mode: "cash",
      amount: input.amount,
      approvalStatus: status,
      rejectReason: status === "rejected" ? "Wrong" : null,
      ...audit(by),
    },
  });
  if (status === "approved")
    await prisma.$transaction((tx) =>
      accountLedger.post(tx, workspaceId, by, [
        {
          accountId: input.fromAccountId,
          projectId: input.projectId,
          entryDate: input.date,
          kind: "transfer_out",
          amount: -input.amount,
          mode: "cash",
          sourceType: "account_transfer",
          sourceId: id,
        },
        {
          accountId: input.toAccountId,
          projectId: input.projectId,
          entryDate: input.date,
          kind: "transfer_in",
          amount: input.amount,
          mode: "cash",
          sourceType: "account_transfer",
          sourceId: id,
        },
      ]),
    );
  return id;
}

/** A petty-cash voucher; an approved one posts its entries. */
export async function reportVoucher(
  workspaceId: string,
  by: string,
  input: {
    accountId: string;
    projectId: string | null;
    date: string;
    amount: bigint;
    type?: "payment" | "receipt" | "transfer";
    toAccountId?: string;
    categoryId?: string;
    status?: Status;
    party?: string;
  },
): Promise<string> {
  const id = randomUUID();
  const type = input.type ?? "payment";
  const status = input.status ?? "approved";
  const voucherNumber = number("PC");
  await prisma.constructionFinancePettyCashVoucher.create({
    data: {
      id,
      workspaceId,
      number: voucherNumber,
      accountId: input.accountId,
      voucherType: type,
      voucherDate: calendarDateToDb(input.date),
      projectId: input.projectId,
      counterpartyName: input.party ?? null,
      toAccountId: type === "transfer" ? (input.toAccountId ?? null) : null,
      paymentCategoryId:
        type === "transfer"
          ? null
          : (input.categoryId ?? (await reportCategory(workspaceId, by))),
      amount: input.amount,
      approvalStatus: status,
      rejectReason: status === "rejected" ? "No bill" : null,
      ...audit(by),
    },
  });
  if (status !== "approved") return id;
  const entries =
    type === "transfer"
      ? [
          {
            accountId: input.accountId,
            kind: "transfer_out" as const,
            amount: -input.amount,
          },
          {
            accountId: input.toAccountId ?? "",
            kind: "transfer_in" as const,
            amount: input.amount,
          },
        ]
      : [
          {
            accountId: input.accountId,
            kind:
              type === "receipt" ? ("receipt" as const) : ("payment" as const),
            amount: type === "receipt" ? input.amount : -input.amount,
          },
        ];
  await prisma.$transaction((tx) =>
    accountLedger.post(
      tx,
      workspaceId,
      by,
      entries.map((entry) => ({
        ...entry,
        projectId: input.projectId,
        entryDate: input.date,
        mode: "cash" as const,
        documentNumber: voucherNumber,
        sourceType: "petty_cash_voucher" as const,
        sourceId: id,
      })),
    ),
  );
  return id;
}

/** An Other Expense; an approved one posts its entry. */
export async function reportOtherExpense(
  workspaceId: string,
  by: string,
  input: {
    accountId: string;
    projectId: string;
    date: string;
    amount: bigint;
    status?: Status;
    categoryId?: string;
  },
): Promise<string> {
  const id = randomUUID();
  const status = input.status ?? "approved";
  const expenseNumber = number("EXP");
  await prisma.constructionFinanceOtherExpense.create({
    data: {
      id,
      workspaceId,
      number: expenseNumber,
      projectId: input.projectId,
      expenseDate: calendarDateToDb(input.date),
      paymentCategoryId:
        input.categoryId ?? (await reportCategory(workspaceId, by)),
      payeeName: "Tea stall",
      accountId: input.accountId,
      mode: "cash",
      amount: input.amount,
      approvalStatus: status,
      rejectReason: status === "rejected" ? "No bill" : null,
      ...audit(by),
    },
  });
  if (status === "approved")
    await reportEntry(workspaceId, by, {
      accountId: input.accountId,
      projectId: input.projectId,
      date: input.date,
      amount: -input.amount,
      sourceType: "other_expense",
      sourceId: id,
      documentNumber: expenseNumber,
    });
  return id;
}

/** A labour or vendor wage payment (M2), with or without its account. */
export async function reportWagePayment(
  workspaceId: string,
  by: string,
  input: {
    partyType: "labour" | "vendor";
    projectId: string;
    date: string;
    amount: number;
    deleted?: boolean;
  },
): Promise<void> {
  await prisma.constructionLabourWagePayment.create({
    data: {
      id: randomUUID(),
      workspaceId,
      partyType: input.partyType,
      partyId: randomUUID(),
      projectId: input.projectId,
      paymentDate: calendarDateToDb(input.date),
      kind: "payment",
      mode: "cash",
      amount: input.amount,
      ...audit(by),
      ...(input.deleted === true
        ? { deletedAt: new Date(), deletedBy: by }
        : {}),
    },
  });
}
