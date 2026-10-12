import { prisma } from "@repo/construction-db";
import { StatusCodes } from "http-status-codes";
import { describe, expect, it, vi } from "vitest";

import { GET as getOpenApi } from "@/app/api/openapi.json/route";
import type { Flag } from "@/src/shared-kernel/access";
import { actAs, addMember, addProject, newCompany } from "@/test/companies";
import { seededAccounts } from "@/test/finance";
import {
  reportEntry,
  reportInvoice,
  reportOtherExpense,
  reportPartyPayment,
  reportReverse,
  reportSettlement,
  reportTransaction,
  reportTransfer,
  reportVoucher,
  reportWagePayment,
} from "@/test/finance-reports";
import { addAccount } from "@/test/finance";
import { addContractor, addSupplier } from "@/test/procurement";
import { TEST_ORIGIN } from "@/test/sessions";

import type { GetConstructionFinanceDashboardResponseModel as Dashboard } from "./dashboard-models";
import { GET } from "./route";

vi.mock(import("@repo/auth/construction/server"), async (importOriginal) => ({
  ...(await importOriginal()),
  getCompanyAuthFromHeaders: vi.fn(),
}));

type Actor = { userId: string; workspaceId: string; role: "owner" | "member" };

const DURATION = { from: "2026-08-01", to: "2026-09-30" };

function read(actor: Actor, projectId: string, range = DURATION) {
  actAs(actor);
  const query = new URLSearchParams({ projectId, ...range });
  return GET(
    new Request(
      `${TEST_ORIGIN}/api/construction/finance/dashboard?${query.toString()}`,
    ),
  );
}

async function dashboard(actor: Actor, projectId: string): Promise<Dashboard> {
  const response = await read(actor, projectId);
  expect(response.status).toBe(StatusCodes.OK);
  return (await response.json()) as Dashboard;
}

async function setup() {
  const company = await newCompany();
  const ws = company.workspaceId;
  const by = company.ownerId;
  const owner: Actor = { userId: by, workspaceId: ws, role: "owner" };
  const tower = await addProject(ws, by, "Tower A");
  const villa = await addProject(ws, by, "Villa B");
  const { cashId, bankId } = await seededAccounts(ws);
  const member = async (
    grants: Record<string, Flag[]>,
    projectIds: string[],
  ) => {
    const added = await addMember(ws, by, grants);
    for (const projectId of projectIds)
      await prisma.constructionOrganizationTeamMemberProject.create({
        data: { memberId: added.memberId, projectId },
      });
    return { userId: added.userId, workspaceId: ws, role: "member" } as Actor;
  };
  return { ws, by, owner, tower, villa, cashId, bankId, member };
}

describe("finance dashboard HTTP (CM-709)", () => {
  it("money in and out by month, dues and module-wise payments across two parties and two accounts", async () => {
    const s = await setup();
    const velan = await addContractor(s.ws, s.by, [s.tower]);
    await prisma.constructionMastersContractor.update({
      where: { id: velan },
      data: { name: "Velan Constructions" },
    });
    const traders = await addSupplier(s.ws, s.by, {
      name: "Sri Murugan Traders",
      projectIds: [s.tower],
    });
    // Openings never count; money before the duration starts the balance.
    await reportEntry(s.ws, s.by, {
      accountId: s.cashId,
      date: "2026-04-01",
      amount: 5_00_000_00n,
      kind: "opening",
      sourceType: "account",
      sourceId: s.cashId,
      projectId: s.tower,
    });
    await reportTransaction(s.ws, s.by, {
      accountId: s.cashId,
      projectId: s.tower,
      date: "2026-07-15",
      amount: 10_000_00n,
      type: "payment_in",
    });
    // August: a receipt into the bank; a contractor paid from the bank and
    // a supplier from cash.
    await reportTransaction(s.ws, s.by, {
      accountId: s.bankId,
      projectId: s.tower,
      date: "2026-08-05",
      amount: 50_000_00n,
      type: "payment_in",
    });
    const bill = await reportInvoice(s.ws, s.by, {
      partyType: "contractor",
      partyId: velan,
      projectId: s.tower,
      date: "2026-08-01",
      dueDate: "2026-08-31",
      amount: 1_00_000_00n,
    });
    await reportPartyPayment(s.ws, s.by, {
      partyType: "contractor",
      partyId: velan,
      projectId: s.tower,
      accountId: s.bankId,
      date: "2026-08-20",
      amount: 20_000_00n,
      mode: "online",
      tds: { amount: 400_00n, base: 20_400_00n, rate: "2.00" },
      allocations: [{ invoiceId: bill, amount: 20_400_00n }],
    });
    const goods = await reportInvoice(s.ws, s.by, {
      partyType: "supplier",
      partyId: traders,
      projectId: s.tower,
      date: "2026-08-25",
      dueDate: "2026-10-20",
      amount: 8_000_00n,
    });
    await reportPartyPayment(s.ws, s.by, {
      partyType: "supplier",
      partyId: traders,
      projectId: s.tower,
      accountId: s.cashId,
      date: "2026-08-26",
      amount: 5_000_00n,
      allocations: [{ invoiceId: goods, amount: 5_000_00n }],
    });
    // September: an expense; a payment corrected (reversed) the same
    // month; a transfer between our own accounts moves nothing.
    await reportOtherExpense(s.ws, s.by, {
      accountId: s.cashId,
      projectId: s.tower,
      date: "2026-09-10",
      amount: 1_000_00n,
    });
    const corrected = await reportTransaction(s.ws, s.by, {
      accountId: s.cashId,
      projectId: s.tower,
      date: "2026-09-12",
      amount: 3_000_00n,
    });
    await reportReverse(s.ws, s.by, "transaction", corrected);
    await reportTransfer(s.ws, s.by, {
      fromAccountId: s.bankId,
      toAccountId: s.cashId,
      projectId: s.tower,
      date: "2026-09-15",
      amount: 7_000_00n,
    });
    // Other Projects, later dates and cancelled wages stay out.
    await reportTransaction(s.ws, s.by, {
      accountId: s.cashId,
      projectId: s.villa,
      date: "2026-09-01",
      amount: 99_000_00n,
    });
    await reportTransaction(s.ws, s.by, {
      accountId: s.cashId,
      projectId: s.tower,
      date: "2026-10-01",
      amount: 99_000_00n,
    });
    await reportWagePayment(s.ws, s.by, {
      partyType: "labour",
      projectId: s.tower,
      date: "2026-09-05",
      amount: 2_500_00,
    });
    await reportWagePayment(s.ws, s.by, {
      partyType: "vendor",
      projectId: s.tower,
      date: "2026-09-06",
      amount: 1_500_00,
    });
    await reportWagePayment(s.ws, s.by, {
      partyType: "labour",
      projectId: s.tower,
      date: "2026-09-07",
      amount: 9_999_00,
      deleted: true,
    });

    const body = await dashboard(s.owner, s.tower);
    expect(body.payments?.months).toEqual([
      {
        month: "2026-08",
        in: 50_000_00,
        out: 25_000_00,
        net: 25_000_00,
        balance: 35_000_00,
      },
      {
        month: "2026-09",
        in: 0,
        out: 1_000_00,
        net: -1_000_00,
        balance: 34_000_00,
      },
    ]);
    expect(body.payments?.totals).toEqual({
      in: 50_000_00,
      out: 26_000_00,
      net: 24_000_00,
    });
    expect(body.payments?.dues).toEqual([
      {
        partyType: "contractor",
        partyId: velan,
        name: "Velan Constructions",
        invoiced: 1_00_000_00,
        paid: 20_400_00,
        due: 79_600_00,
        overdue: 79_600_00,
      },
      {
        partyType: "supplier",
        partyId: traders,
        name: "Sri Murugan Traders",
        invoiced: 8_000_00,
        paid: 5_000_00,
        due: 3_000_00,
        overdue: 0,
      },
    ]);
    expect(body.payments?.modules).toEqual({
      contractor: 20_000_00,
      supplier: 5_000_00,
      labour: 2_500_00,
      vendor: 1_500_00,
      other_party: 0,
      other_expense: 1_000_00,
    });
  });

  it("Payment Approvals counts the Project's pending documents by Approve flag", async () => {
    const s = await setup();
    const holder = await addMember(s.ws, s.by, {});
    const pettyCash = await addAccount(s.ws, s.by, {
      kind: "petty_cash",
      holderMemberId: holder.memberId,
    });
    const contractor = await addContractor(s.ws, s.by, [s.tower]);
    const pending = { status: "pending" as const };
    for (const projectId of [s.tower, s.villa]) {
      await reportTransaction(s.ws, s.by, {
        accountId: s.cashId,
        projectId,
        date: "2026-09-01",
        amount: 100n,
        ...pending,
      });
      await reportTransfer(s.ws, s.by, {
        fromAccountId: s.bankId,
        toAccountId: s.cashId,
        projectId,
        date: "2026-09-01",
        amount: 100n,
        ...pending,
      });
      await reportVoucher(s.ws, s.by, {
        accountId: pettyCash,
        projectId,
        date: "2026-09-01",
        amount: 100n,
        ...pending,
      });
      await reportOtherExpense(s.ws, s.by, {
        accountId: s.cashId,
        projectId,
        date: "2026-09-01",
        amount: 100n,
        ...pending,
      });
      const invoice = await reportInvoice(s.ws, s.by, {
        partyType: "contractor",
        partyId: contractor,
        projectId,
        date: "2026-09-01",
        amount: 100n,
      });
      await reportSettlement(s.ws, s.by, { invoiceId: invoice, amount: 100n });
    }
    // Decided documents do not count.
    await reportTransaction(s.ws, s.by, {
      accountId: s.cashId,
      projectId: s.tower,
      date: "2026-09-01",
      amount: 100n,
      status: "rejected",
    });
    await reportOtherExpense(s.ws, s.by, {
      accountId: s.cashId,
      projectId: s.tower,
      date: "2026-09-01",
      amount: 100n,
    });

    expect((await dashboard(s.owner, s.tower)).approvals).toEqual({
      transactions: 1,
      transfers: 1,
      vouchers: 1,
      otherExpenses: 1,
      settlements: 1,
      total: 5,
    });
    const approver = await s.member(
      {
        "reporting.project_dashboard": ["read"],
        "finance.transactions": ["read", "approve"],
      },
      [s.tower],
    );
    const theirs = await dashboard(approver, s.tower);
    expect(theirs.approvals).toEqual({
      transactions: 1,
      transfers: 1,
      vouchers: null,
      otherExpenses: null,
      settlements: null,
      total: 2,
    });
    // Without Payments Read the section is null, not refused.
    expect(theirs.payments).toBeNull();
  });

  it("needs Dashboard Read on the Project", async () => {
    const s = await setup();
    const reader = await s.member(
      { "reporting.project_dashboard": ["read"], "finance.payments": ["read"] },
      [s.tower],
    );
    expect((await dashboard(reader, s.tower)).payments).not.toBeNull();
    expect((await read(reader, s.villa)).status).toBe(StatusCodes.FORBIDDEN);
    const paymentsOnly = await s.member({ "finance.payments": ["read"] }, [
      s.tower,
    ]);
    expect((await read(paymentsOnly, s.tower)).status).toBe(
      StatusCodes.FORBIDDEN,
    );
    expect(
      (await read(s.owner, s.tower, { from: "2026-09-30", to: "2026-09-01" }))
        .status,
    ).toBe(StatusCodes.BAD_REQUEST);
  });

  it("is on /api/docs", async () => {
    const document = (await getOpenApi().json()) as {
      paths: Record<string, unknown>;
    };
    expect(document.paths).toHaveProperty(
      "/api/construction/finance/dashboard",
    );
  });
});
