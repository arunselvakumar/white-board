import { prisma } from "@repo/construction-db";
import ExcelJS from "exceljs";
import { StatusCodes } from "http-status-codes";
import { describe, expect, it, vi } from "vitest";

import type { Flag } from "@/src/shared-kernel/access";
import { actAs, addMember, addProject, newCompany } from "@/test/companies";
import { addAccount, seededAccounts } from "@/test/finance";
import {
  reportCancelPayment,
  reportCategory,
  reportEntry,
  reportInvoice,
  reportOtherExpense,
  reportOtherParty,
  reportPartyOpening,
  reportPartyPayment,
  reportReverse,
  reportSettlement,
  reportTransaction,
  reportTransfer,
  reportVoucher,
} from "@/test/finance-reports";
import { bytesOf } from "@/test/files";
import { addContractor, addSupplier } from "@/test/procurement";
import { TEST_ORIGIN } from "@/test/sessions";

import { GET as downloadReport } from "./[id]/download/route";
import type {
  ConstructionReportingReportJobResponseModel as Job,
  ListConstructionReportingReportsResponseModel as JobList,
} from "./report-models";
import { GET as listReports, POST as requestReport } from "./route";

vi.mock(import("@repo/auth/construction/server"), async (importOriginal) => ({
  ...(await importOriginal()),
  getCompanyAuthFromHeaders: vi.fn(),
}));

const BASE = `${TEST_ORIGIN}/api/construction/reporting/reports`;
const SEPTEMBER = { from: "2026-09-01", to: "2026-09-30" };

type Actor = { userId: string; workspaceId: string; role: "owner" | "member" };

async function json<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

function request(actor: Actor, body: unknown) {
  actAs(actor);
  return requestReport(
    new Request(BASE, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

function list(actor: Actor, projectId?: string) {
  actAs(actor);
  return listReports(
    new Request(projectId == null ? BASE : `${BASE}?projectId=${projectId}`),
  );
}

function download(actor: Actor, id: string, format: "xlsx" | "pdf") {
  actAs(actor);
  return downloadReport(
    new Request(`${BASE}/${id}/download?format=${format}`),
    { params: Promise.resolve({ id }) },
  );
}

async function generate(actor: Actor, body: unknown): Promise<Job> {
  const response = await request(actor, body);
  expect(response.status).toBe(StatusCodes.CREATED);
  const job = await json<Job>(response);
  expect(job.error).toBeNull();
  expect(job.status).toBe("done");
  return job;
}

async function workbook(actor: Actor, job: Job): Promise<ExcelJS.Workbook> {
  const response = await download(actor, job.id, "xlsx");
  expect(response.status).toBe(StatusCodes.OK);
  const book = new ExcelJS.Workbook();
  const bytes = Buffer.from(await bytesOf(response));
  await book.xlsx.load(bytes as unknown as ExcelJS.Buffer);
  return book;
}

async function expectPdf(actor: Actor, job: Job): Promise<void> {
  const response = await download(actor, job.id, "pdf");
  expect(response.status).toBe(StatusCodes.OK);
  const bytes = await bytesOf(response);
  expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe("%PDF-");
}

function rowsOf(sheet: ExcelJS.Worksheet | undefined): unknown[][] {
  const rows: unknown[][] = [];
  sheet?.eachRow({ includeEmpty: true }, (row, number) => {
    rows[number - 1] = (row.values as unknown[]).slice(1);
  });
  return Array.from(rows, (row: unknown[] | undefined) => row ?? []);
}

/** The table under the header row that starts with `first`. */
function tableOf(sheet: ExcelJS.Worksheet | undefined, first: string) {
  const rows = rowsOf(sheet);
  const headerIndex = rows.findIndex((row) => row[0] === first);
  const header = (rows[headerIndex] ?? []) as string[];
  const body = rows.slice(headerIndex + 1);
  const totalsIndex = body.findIndex((row) => row[0] === "Total");
  const lines = totalsIndex < 0 ? body : body.slice(0, totalsIndex);
  const cell = (row: unknown[] | undefined, label: string) =>
    row?.[header.indexOf(label)];
  return {
    header,
    lines,
    cell,
    column: (label: string) => lines.map((row) => cell(row, label)),
    totals: totalsIndex < 0 ? undefined : body[totalsIndex],
  };
}

async function setup() {
  const company = await newCompany();
  const ws = company.workspaceId;
  const by = company.ownerId;
  const owner: Actor = { userId: by, workspaceId: ws, role: "owner" };
  const tower = await addProject(ws, by, "Tower A");
  const villa = await addProject(ws, by, "Villa B");
  const accounts = await seededAccounts(ws);
  const member = async (
    grants: Record<string, Flag[]>,
    projectIds: readonly string[] = [],
  ) => {
    const added = await addMember(ws, by, grants);
    for (const projectId of projectIds)
      await prisma.constructionOrganizationTeamMemberProject.create({
        data: { memberId: added.memberId, projectId },
      });
    return {
      actor: {
        userId: added.userId,
        workspaceId: ws,
        role: "member",
      } satisfies Actor as Actor,
      memberId: added.memberId,
    };
  };
  return { ws, by, owner, tower, villa, accounts, member };
}

describe("finance report jobs HTTP (CM-709)", () => {
  it("Ledger: opening from before the period, reversals net out, closing at its end", async () => {
    const s = await setup();
    const { cashId } = s.accounts;
    const fuel = await reportCategory(s.ws, s.by, "Diesel");
    // Before September: the opening.
    await reportEntry(s.ws, s.by, {
      accountId: cashId,
      date: "2026-08-01",
      amount: 1_00_000_00n,
      kind: "opening",
      sourceType: "account",
      sourceId: cashId,
    });
    await reportTransaction(s.ws, s.by, {
      accountId: cashId,
      projectId: s.tower,
      date: "2026-08-31",
      amount: 10_000_00n,
    });
    // In September: a receipt, a payment that is then corrected, an expense.
    await reportTransaction(s.ws, s.by, {
      accountId: cashId,
      projectId: s.tower,
      date: "2026-09-02",
      amount: 25_000_00n,
      type: "payment_in",
      counterpartyName: "Owner's capital",
    });
    const corrected = await reportTransaction(s.ws, s.by, {
      accountId: cashId,
      projectId: s.tower,
      date: "2026-09-05",
      amount: 7_000_00n,
      categoryId: fuel,
    });
    await reportReverse(s.ws, s.by, "transaction", corrected);
    await reportOtherExpense(s.ws, s.by, {
      accountId: cashId,
      projectId: s.villa,
      date: "2026-09-30",
      amount: 3_000_00n,
    });
    // After September and pending documents move nothing.
    await reportTransaction(s.ws, s.by, {
      accountId: cashId,
      projectId: s.tower,
      date: "2026-10-01",
      amount: 50_000_00n,
    });
    await reportTransaction(s.ws, s.by, {
      accountId: cashId,
      projectId: s.tower,
      date: "2026-09-10",
      amount: 99_000_00n,
      status: "pending",
    });

    const job = await generate(s.owner, {
      kind: "account_ledger",
      projectId: null,
      params: { ...SEPTEMBER, accountId: cashId },
    });
    expect(job.params).toMatchObject({ accountId: cashId });
    const book = await workbook(s.owner, job);
    const summary = tableOf(book.getWorksheet("Summary"), "Figure");
    expect(summary.lines).toEqual([
      ["Opening balance", 90_000],
      ["Total credit", 32_000],
      ["Total debit", 10_000],
      ["Closing balance", 112_000],
    ]);
    const ledger = tableOf(book.getWorksheet("Ledger"), "Date");
    expect(ledger.column("Type")).toEqual([
      "Opening balance",
      "Receipt",
      "Payment",
      "Reversal: Payment",
      "Payment",
    ]);
    expect(ledger.column("Balance")).toEqual([
      90_000, 115_000, 108_000, 115_000, 112_000,
    ]);
    expect(ledger.column("Project")).toEqual([
      undefined,
      "Tower A",
      "Tower A",
      "Tower A",
      "Villa B",
    ]);
    expect(ledger.cell(ledger.lines[2], "Category")).toBe("Diesel");
    expect(ledger.cell(ledger.totals, "Balance")).toBe(112_000);
    await expectPdf(s.owner, job);

    // A module filter applies to the opening too, as on the statement.
    const filtered = await generate(s.owner, {
      kind: "account_ledger",
      projectId: null,
      params: { ...SEPTEMBER, accountId: cashId, module: "other_expense" },
    });
    const filteredBook = await workbook(s.owner, filtered);
    const lines = tableOf(filteredBook.getWorksheet("Ledger"), "Date");
    expect(lines.column("Module")).toEqual([undefined, "Other Expense"]);
    expect(lines.column("Balance")).toEqual([0, -3_000]);
    expect(lines.cell(lines.totals, "Balance")).toBe(-3_000);
  });

  it("Ledger: a company account needs Company's Bank A/C Report; a petty-cash account its holder or View all", async () => {
    const s = await setup();
    const banker = await s.member({
      "masters.bank_accounts": ["read", "report"],
    });
    const holder = await s.member({ "finance.petty_cash": ["read", "report"] });
    const other = await s.member({ "finance.petty_cash": ["read", "report"] });
    const viewAll = await s.member({
      "finance.petty_cash": ["read", "report", "view_all"],
    });
    const pettyCash = await addAccount(s.ws, s.by, {
      kind: "petty_cash",
      holderMemberId: holder.memberId,
    });
    const body = (accountId: string) => ({
      kind: "account_ledger",
      projectId: null,
      params: { ...SEPTEMBER, accountId },
    });
    await generate(banker.actor, body(s.accounts.bankId));
    expect((await request(holder.actor, body(s.accounts.bankId))).status).toBe(
      StatusCodes.FORBIDDEN,
    );
    expect((await request(banker.actor, body(pettyCash))).status).toBe(
      StatusCodes.FORBIDDEN,
    );
    await generate(holder.actor, body(pettyCash));
    expect((await request(other.actor, body(pettyCash))).status).toBe(
      StatusCodes.NOT_FOUND,
    );
    await generate(viewAll.actor, body(pettyCash));
    // Another Company's account is 404; the Ledger never takes a Project.
    const elsewhere = await newCompany();
    const theirs = await seededAccounts(elsewhere.workspaceId);
    expect((await request(s.owner, body(theirs.cashId))).status).toBe(
      StatusCodes.NOT_FOUND,
    );
    expect(
      (
        await request(s.owner, {
          ...body(s.accounts.cashId),
          projectId: s.tower,
        })
      ).status,
    ).toBe(StatusCodes.BAD_REQUEST);
  });

  it("Petty Cash: own account only without View all; totals approved vouchers; others' reports stay private", async () => {
    const s = await setup();
    const prabhu = await s.member(
      { "finance.petty_cash": ["read", "report"] },
      [s.tower],
    );
    const viewAll = await s.member(
      { "finance.petty_cash": ["read", "report", "view_all"] },
      [s.tower],
    );
    const mine = await addAccount(s.ws, s.by, {
      kind: "petty_cash",
      holderMemberId: prabhu.memberId,
      name: "Prabhu petty cash",
    });
    const theirs = await addAccount(s.ws, s.by, {
      kind: "petty_cash",
      holderMemberId: viewAll.memberId,
      name: "Site office petty cash",
    });
    await reportVoucher(s.ws, s.by, {
      accountId: s.accounts.cashId,
      projectId: s.tower,
      date: "2026-09-01",
      amount: 10_000_00n,
      type: "transfer",
      toAccountId: mine,
    });
    await reportVoucher(s.ws, s.by, {
      accountId: mine,
      projectId: s.tower,
      date: "2026-09-03",
      amount: 1_500_00n,
      party: "Diesel bunk",
    });
    await reportVoucher(s.ws, s.by, {
      accountId: mine,
      projectId: s.tower,
      date: "2026-09-04",
      amount: 900_00n,
      status: "pending",
    });
    await reportVoucher(s.ws, s.by, {
      accountId: mine,
      projectId: s.villa,
      date: "2026-09-04",
      amount: 111_00n,
    });
    await reportVoucher(s.ws, s.by, {
      accountId: theirs,
      projectId: s.tower,
      date: "2026-09-05",
      amount: 2_000_00n,
    });

    const own = await generate(prabhu.actor, {
      kind: "petty_cash",
      projectId: s.tower,
      params: SEPTEMBER,
    });
    const book = await workbook(prabhu.actor, own);
    const vouchers = tableOf(book.getWorksheet("Vouchers"), "Date");
    expect(vouchers.column("Account")).toEqual([
      "Prabhu petty cash",
      "Prabhu petty cash",
      "Prabhu petty cash",
    ]);
    expect(vouchers.column("Type")).toEqual(["Transfer", "Payment", "Payment"]);
    expect(vouchers.column("Credit")).toEqual([10_000, undefined, undefined]);
    expect(vouchers.column("Status")).toEqual([
      "Approved",
      "Approved",
      "Pending",
    ]);
    expect(vouchers.cell(vouchers.totals, "Credit")).toBe(10_000);
    expect(vouchers.cell(vouchers.totals, "Debit")).toBe(1_500);
    const balances = tableOf(book.getWorksheet("Closing balances"), "Account");
    // The Villa B voucher counts in the account's balance, not the list.
    expect(balances.lines).toEqual([
      ["Prabhu petty cash", "Prabhu Saravanan", 8_389, -900],
    ]);

    expect(
      (
        await request(prabhu.actor, {
          kind: "petty_cash",
          projectId: s.tower,
          params: { ...SEPTEMBER, accountId: theirs },
        })
      ).status,
    ).toBe(StatusCodes.NOT_FOUND);

    const every = await generate(viewAll.actor, {
      kind: "petty_cash",
      projectId: s.tower,
      params: SEPTEMBER,
    });
    const everyBook = await workbook(viewAll.actor, every);
    expect(
      tableOf(everyBook.getWorksheet("Closing balances"), "Account").column(
        "Account",
      ),
    ).toEqual(["Prabhu petty cash", "Site office petty cash"]);
    // Prabhu cannot see or download the View-all member's report.
    const listed = await json<JobList>(await list(prabhu.actor, s.tower));
    expect(listed.items.map((job) => job.id)).toEqual([own.id]);
    expect((await download(prabhu.actor, every.id, "xlsx")).status).toBe(
      StatusCodes.FORBIDDEN,
    );
    // Without Petty Cash Report there is no report at all.
    const reader = await s.member({ "finance.petty_cash": ["read"] }, [
      s.tower,
    ]);
    expect(
      (
        await request(reader.actor, {
          kind: "petty_cash",
          projectId: s.tower,
          params: SEPTEMBER,
        })
      ).status,
    ).toBe(StatusCodes.FORBIDDEN);
  });

  it("Transactions and Other Expenses list the Project's documents with status", async () => {
    const s = await setup();
    const { cashId, bankId } = s.accounts;
    await reportTransaction(s.ws, s.by, {
      accountId: cashId,
      projectId: s.tower,
      date: "2026-09-02",
      amount: 5_000_00n,
      type: "payment_in",
    });
    await reportTransaction(s.ws, s.by, {
      accountId: cashId,
      projectId: s.tower,
      date: "2026-09-03",
      amount: 2_000_00n,
      status: "rejected",
    });
    await reportTransaction(s.ws, s.by, {
      accountId: cashId,
      projectId: s.villa,
      date: "2026-09-03",
      amount: 9_000_00n,
    });
    await reportTransfer(s.ws, s.by, {
      fromAccountId: bankId,
      toAccountId: cashId,
      projectId: s.tower,
      date: "2026-09-04",
      amount: 20_000_00n,
    });
    await reportOtherExpense(s.ws, s.by, {
      accountId: cashId,
      projectId: s.tower,
      date: "2026-09-05",
      amount: 450_00n,
    });
    await reportOtherExpense(s.ws, s.by, {
      accountId: cashId,
      projectId: s.tower,
      date: "2026-09-06",
      amount: 999_00n,
      status: "pending",
    });
    const txn = await generate(s.owner, {
      kind: "transactions",
      projectId: s.tower,
      params: SEPTEMBER,
    });
    const book = await workbook(s.owner, txn);
    const transactions = tableOf(book.getWorksheet("Transactions"), "Date");
    expect(transactions.column("Status")).toEqual(["Approved", "Rejected"]);
    expect(transactions.cell(transactions.totals, "Payment In")).toBe(5_000);
    expect(transactions.cell(transactions.totals, "Payment Out")).toBe(0);
    const transfers = tableOf(book.getWorksheet("Transfers"), "Date");
    expect(
      transfers.lines.map((row) => transfers.cell(row, "From account")),
    ).toEqual(["Company's Bank Account"]);
    const expenses = await generate(s.owner, {
      kind: "other_expenses",
      projectId: s.tower,
      params: SEPTEMBER,
    });
    const expenseRows = tableOf(
      (await workbook(s.owner, expenses)).getWorksheet("Other Expenses"),
      "Date",
    );
    expect(expenseRows.column("Amount")).toEqual([450, 999]);
    expect(expenseRows.cell(expenseRows.totals, "Amount")).toBe(450);

    // Each needs Report on its own menu.
    const reader = await s.member(
      {
        "finance.transactions": ["read"],
        "finance.other_expenses": ["read", "report"],
      },
      [s.tower],
    );
    expect(
      (
        await request(reader.actor, {
          kind: "transactions",
          projectId: s.tower,
          params: SEPTEMBER,
        })
      ).status,
    ).toBe(StatusCodes.FORBIDDEN);
    await generate(reader.actor, {
      kind: "other_expenses",
      projectId: s.tower,
      params: SEPTEMBER,
    });
    expect(
      (
        await request(reader.actor, {
          kind: "other_expenses",
          projectId: s.villa,
          params: SEPTEMBER,
        })
      ).status,
    ).toBe(StatusCodes.FORBIDDEN);
  });

  it("Contractor Payments: opening, invoices with TDS shares, payments, cancellations and write-offs", async () => {
    const s = await setup();
    const velan = await addContractor(s.ws, s.by, [s.tower]);
    await prisma.constructionMastersContractor.update({
      where: { id: velan },
      data: { name: "Velan Constructions" },
    });
    await reportPartyOpening(s.ws, s.by, {
      partyType: "contractor",
      partyId: velan,
      projectId: s.tower,
      date: "2026-08-01",
      amount: 5_000_00n,
    });
    const bill = await reportInvoice(s.ws, s.by, {
      partyType: "contractor",
      partyId: velan,
      projectId: s.tower,
      date: "2026-09-01",
      dueDate: "2026-09-15",
      amount: 1_00_000_00n,
      number: "RA-1",
    });
    const small = await reportInvoice(s.ws, s.by, {
      partyType: "contractor",
      partyId: velan,
      projectId: s.tower,
      date: "2026-09-02",
      amount: 10_000_00n,
      number: "RA-2",
    });
    await reportPartyPayment(s.ws, s.by, {
      partyType: "contractor",
      partyId: velan,
      projectId: s.tower,
      accountId: s.accounts.bankId,
      date: "2026-09-10",
      amount: 49_000_00n,
      mode: "online",
      tds: { amount: 1_000_00n, base: 50_000_00n, rate: "2.00" },
      allocations: [{ invoiceId: bill, amount: 50_000_00n }],
    });
    const cancelled = await reportPartyPayment(s.ws, s.by, {
      partyType: "contractor",
      partyId: velan,
      projectId: s.tower,
      accountId: s.accounts.cashId,
      date: "2026-09-11",
      amount: 7_000_00n,
      allocations: [{ invoiceId: small, amount: 7_000_00n }],
    });
    await reportCancelPayment(s.ws, s.by, cancelled);
    await reportSettlement(s.ws, s.by, {
      invoiceId: small,
      amount: 10_000_00n,
      status: "approved",
      date: "2026-09-20",
    });

    const job = await generate(s.owner, {
      kind: "contractor_payments",
      projectId: s.tower,
      params: { ...SEPTEMBER, partyId: velan },
    });
    const book = await workbook(s.owner, job);
    const summary = tableOf(book.getWorksheet("Summary"), "Contractor");
    expect(summary.lines).toEqual([
      ["Velan Constructions", 5_000, 110_000, 49_000, 1_000, 10_000, 55_000],
    ]);
    const invoices = tableOf(book.getWorksheet("Invoices"), "Contractor");
    expect(invoices.column("Invoice No.")).toEqual(["RA-1", "RA-2"]);
    expect(invoices.column("TDS")).toEqual([1_000, 0]);
    expect(invoices.column("Paid")).toEqual([49_000, 0]);
    expect(invoices.column("Written off")).toEqual([0, 10_000]);
    expect(invoices.column("Balance")).toEqual([50_000, 0]);
    const payments = tableOf(book.getWorksheet("Payments"), "Contractor");
    expect(payments.lines).toHaveLength(1);
    expect(payments.cell(payments.lines[0], "Account")).toBe(
      "Company's Bank Account",
    );
    expect(payments.cell(payments.lines[0], "Reference")).toBe("UTR123");
    await expectPdf(s.owner, job);

    // Supplier Payments is the same register for Suppliers.
    const supplier = await addSupplier(s.ws, s.by, {
      name: "Sri Murugan Traders",
      projectIds: [s.tower],
    });
    await reportInvoice(s.ws, s.by, {
      partyType: "supplier",
      partyId: supplier,
      projectId: s.tower,
      date: "2026-09-03",
      amount: 2_000_00n,
    });
    const suppliers = await generate(s.owner, {
      kind: "supplier_payments",
      projectId: s.tower,
      params: SEPTEMBER,
    });
    expect(
      tableOf(
        (await workbook(s.owner, suppliers)).getWorksheet("Summary"),
        "Supplier",
      ).lines,
    ).toEqual([["Sri Murugan Traders", 0, 2_000, 0, 0, 0, 2_000]]);
  });

  it("TDS 194C: quarters of the financial year; a member sees only their Projects", async () => {
    const s = await setup();
    const velan = await addContractor(s.ws, s.by, [s.tower, s.villa]);
    await prisma.constructionMastersContractor.update({
      where: { id: velan },
      data: { name: "Velan Constructions", pan: "ABCPV1234K" },
    });
    const pay = (
      projectId: string,
      date: string,
      tds: bigint,
      extra: { suggested?: bigint; reason?: string } = {},
    ) =>
      reportPartyPayment(s.ws, s.by, {
        partyType: "contractor",
        partyId: velan,
        projectId,
        accountId: s.accounts.cashId,
        date,
        amount: 50_000_00n,
        tds: { amount: tds, base: tds * 100n, rate: "1.00", ...extra },
      });
    await pay(s.tower, "2026-05-10", 500_00n);
    await pay(s.tower, "2026-10-02", 400_00n, {
      suggested: 300_00n,
      reason: "Catch-up of earlier payments",
    });
    await pay(s.villa, "2027-02-01", 100_00n);
    await pay(s.tower, "2026-03-31", 999_00n); // the year before
    const cancelled = await pay(s.tower, "2026-06-01", 777_00n);
    await reportCancelPayment(s.ws, s.by, cancelled);

    const job = await generate(s.owner, {
      kind: "tds_194c",
      projectId: null,
      params: { fy: "2026-27" },
    });
    const book = await workbook(s.owner, job);
    const payments = tableOf(book.getWorksheet("Payments"), "Contractor");
    expect(payments.column("PAN")).toEqual([
      "XXXXXX234K",
      "XXXXXX234K",
      "XXXXXX234K",
    ]);
    expect(payments.column("Payee kind")).toEqual([
      "Individual / HUF",
      "Individual / HUF",
      "Individual / HUF",
    ]);
    expect(payments.column("Overridden")).toEqual(["No", "Yes", "No"]);
    expect(payments.column("Rate")).toEqual(["1.00%", "1.00%", "1.00%"]);
    const quarters = tableOf(
      book.getWorksheet("Quarterly totals"),
      "Contractor",
    );
    expect(quarters.lines).toEqual([
      ["Velan Constructions", "XXXXXX234K", 500, 0, 400, 100, 1_000],
    ]);

    const member = await s.member({ "finance.parties": ["read", "report"] }, [
      s.tower,
    ]);
    const limited = await generate(member.actor, {
      kind: "tds_194c",
      projectId: null,
      params: { fy: "2026-27", contractorId: velan },
    });
    const limitedQuarters = tableOf(
      (await workbook(member.actor, limited)).getWorksheet("Quarterly totals"),
      "Contractor",
    );
    expect(limitedQuarters.lines).toEqual([
      ["Velan Constructions", "XXXXXX234K", 500, 0, 400, 0, 900],
    ]);
    // Only its requester and the Owner may open a central report.
    expect((await download(member.actor, job.id, "xlsx")).status).toBe(
      StatusCodes.FORBIDDEN,
    );
    const noReport = await s.member({ "finance.parties": ["read"] }, [s.tower]);
    expect(
      (
        await request(noReport.actor, {
          kind: "tds_194c",
          projectId: null,
          params: { fy: "2026-27" },
        })
      ).status,
    ).toBe(StatusCodes.FORBIDDEN);
    expect(
      (
        await request(s.owner, {
          kind: "tds_194c",
          projectId: null,
          params: { fy: "2026-28" },
        })
      ).status,
    ).toBe(StatusCodes.BAD_REQUEST);
  });

  it("Due Payments: ageing buckets by days past the due date on a fixed day", async () => {
    const s = await setup();
    const velan = await addContractor(s.ws, s.by, [s.tower]);
    await prisma.constructionMastersContractor.update({
      where: { id: velan },
      data: { name: "Velan Constructions" },
    });
    const buyer = await reportOtherParty(s.ws, s.by, "Flat buyer");
    const bill = (date: string, dueDate: string | null, amount: bigint) =>
      reportInvoice(s.ws, s.by, {
        partyType: "contractor",
        partyId: velan,
        projectId: s.tower,
        date,
        dueDate,
        amount,
      });
    // As on 11 Oct 2026.
    await bill("2026-10-01", "2026-10-11", 1_000_00n); // due today: not due
    await bill("2026-09-01", "2026-09-30", 2_000_00n); // 11 days: 0–30
    const partly = await bill("2026-08-01", "2026-08-12", 3_000_00n); // 60 days: 31–60
    await bill("2026-07-01", "2026-07-12", 4_000_00n); // 91 days: 90+
    await bill("2026-08-01", null, 5_000_00n); // no due date: never due
    await bill("2026-10-12", "2026-10-12", 6_000_00n); // after the day asked
    await reportPartyPayment(s.ws, s.by, {
      partyType: "contractor",
      partyId: velan,
      projectId: s.tower,
      accountId: s.accounts.cashId,
      date: "2026-10-05",
      amount: 1_000_00n,
      allocations: [{ invoiceId: partly, amount: 1_000_00n }],
    });
    await reportInvoice(s.ws, s.by, {
      partyType: "other_party",
      partyId: buyer,
      projectId: s.tower,
      date: "2026-09-01",
      dueDate: "2026-09-10",
      amount: 7_000_00n,
      direction: "receivable",
    });

    const job = await generate(s.owner, {
      kind: "due_payments",
      projectId: s.tower,
      params: { asOn: "2026-10-11" },
    });
    const book = await workbook(s.owner, job);
    const payables = tableOf(book.getWorksheet("Payables"), "Party");
    expect(payables.lines).toEqual([
      [
        "Velan Constructions",
        "Contractor",
        15_000,
        1_000,
        0,
        14_000,
        6_000,
        2_000,
        2_000,
        0,
        4_000,
      ],
    ]);
    const receivables = tableOf(book.getWorksheet("Receivables"), "Party");
    expect(receivables.cell(receivables.lines[0], "Due")).toBe(7_000);
    expect(receivables.cell(receivables.lines[0], "31-60 days")).toBe(7_000);

    // Central: every Project for the Owner, the member's Projects otherwise.
    const other = await addContractor(s.ws, s.by, [s.villa]);
    await reportInvoice(s.ws, s.by, {
      partyType: "contractor",
      partyId: other,
      projectId: s.villa,
      date: "2026-09-01",
      amount: 500_00n,
    });
    const central = await generate(s.owner, {
      kind: "due_payments",
      projectId: null,
      params: { asOn: "2026-10-11" },
    });
    expect(
      tableOf(
        (await workbook(s.owner, central)).getWorksheet("Payables"),
        "Party",
      ).lines,
    ).toHaveLength(2);
    const member = await s.member({ "finance.parties": ["read", "report"] }, [
      s.tower,
    ]);
    const mine = await generate(member.actor, {
      kind: "due_payments",
      projectId: null,
      params: { asOn: "2026-10-11" },
    });
    expect(
      tableOf(
        (await workbook(member.actor, mine)).getWorksheet("Payables"),
        "Party",
      ).column("Party"),
    ).toEqual(["Velan Constructions"]);
    expect(
      (
        await request(member.actor, {
          kind: "due_payments",
          projectId: s.villa,
          params: { asOn: "2026-10-11" },
        })
      ).status,
    ).toBe(StatusCodes.FORBIDDEN);
  });
});
