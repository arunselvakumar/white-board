import { prisma } from "@repo/construction-db";
import { StatusCodes } from "http-status-codes";
import { describe, expect, it, vi } from "vitest";

import { GET as getOpenApi } from "@/app/api/openapi.json/route";
import type { Flag } from "@/src/shared-kernel/access";
import { addDays, todayIn } from "@/src/shared-kernel/calendar-date";
import { actAs, addMember, addProject, newCompany } from "@/test/companies";
import { addAccount, seededAccounts } from "@/test/finance";
import {
  reportInvoice,
  reportOtherExpense,
  reportOtherParty,
  reportPartyOpening,
  reportPartyPayment,
  reportTransaction,
  reportTransfer,
  reportVoucher,
} from "@/test/finance-reports";
import { addContractor, addSupplier } from "@/test/procurement";
import { TEST_ORIGIN } from "@/test/sessions";

import type { GetConstructionFinanceCentralPaymentResponseModel as Summary } from "./central-payment-models";
import { GET as listPartyBalances } from "../parties/route";
import { GET as workspacePartyBalances } from "../party-balances/route";
import { GET } from "./route";

vi.mock(import("@repo/auth/construction/server"), async (importOriginal) => ({
  ...(await importOriginal()),
  getCompanyAuthFromHeaders: vi.fn(),
}));

type Actor = { userId: string; workspaceId: string; role: "owner" | "member" };

function read(actor: Actor) {
  actAs(actor);
  return GET(
    new Request(`${TEST_ORIGIN}/api/construction/finance/central-payment`),
  );
}

async function summary(actor: Actor): Promise<Summary> {
  const response = await read(actor);
  expect(response.status).toBe(StatusCodes.OK);
  return (await response.json()) as Summary;
}

describe("Central Payment HTTP (CM-709)", () => {
  it("party dues across Projects for the Owner, the member's Projects only otherwise", async () => {
    const company = await newCompany();
    const ws = company.workspaceId;
    const by = company.ownerId;
    const owner: Actor = { userId: by, workspaceId: ws, role: "owner" };
    const tower = await addProject(ws, by, "Tower A");
    const villa = await addProject(ws, by, "Villa B");
    const { bankId } = await seededAccounts(ws);
    const velan = await addContractor(ws, by, [tower, villa]);
    await prisma.constructionMastersContractor.update({
      where: { id: velan },
      data: { name: "Velan Constructions" },
    });
    const traders = await addSupplier(ws, by, {
      name: "Sri Murugan Traders",
      projectIds: [villa],
    });
    const buyer = await reportOtherParty(ws, by, "Flat buyer");

    // Velan: a bill on each Project, one overdue; a payment with an
    // unallocated part (an advance) on Tower A.
    const towerBill = await reportInvoice(ws, by, {
      partyType: "contractor",
      partyId: velan,
      projectId: tower,
      date: "2026-08-01",
      dueDate: "2026-08-31",
      amount: 60_000_00n,
    });
    await reportInvoice(ws, by, {
      partyType: "contractor",
      partyId: velan,
      projectId: villa,
      date: "2026-09-01",
      dueDate: "2099-12-31",
      amount: 40_000_00n,
    });
    await reportPartyPayment(ws, by, {
      partyType: "contractor",
      partyId: velan,
      projectId: tower,
      accountId: bankId,
      date: "2026-09-10",
      amount: 24_500_00n,
      mode: "online",
      tds: { amount: 500_00n, base: 25_000_00n, rate: "2.00" },
      allocations: [{ invoiceId: towerBill, amount: 20_000_00n }],
    });
    // Sri Murugan Traders on Villa B only; an opening balance too.
    await reportPartyOpening(ws, by, {
      partyType: "supplier",
      partyId: traders,
      projectId: villa,
      date: "2026-04-01",
      amount: 3_000_00n,
    });
    await reportInvoice(ws, by, {
      partyType: "supplier",
      partyId: traders,
      projectId: villa,
      date: "2026-09-01",
      amount: 7_000_00n,
    });
    // An Other Party owes the Company on a sales invoice.
    await reportInvoice(ws, by, {
      partyType: "other_party",
      partyId: buyer,
      projectId: tower,
      date: "2026-09-01",
      amount: 15_000_00n,
      direction: "receivable",
    });

    const all = await summary(owner);
    expect(all.allProjects).toBe(true);
    expect(all.projectCount).toBe(2);
    expect(all.parties.contractor).toEqual([
      {
        partyId: velan,
        name: "Velan Constructions",
        projectCount: 2,
        invoiced: 1_00_000_00,
        paid: 20_000_00,
        due: 80_000_00,
        overdue: 40_000_00,
        advance: 5_000_00,
        receivable: 0,
        balance: 75_000_00,
      },
    ]);
    expect(all.parties.supplier).toEqual([
      expect.objectContaining({
        name: "Sri Murugan Traders",
        due: 7_000_00,
        balance: 10_000_00,
      }),
    ]);
    expect(all.parties.other_party).toEqual([
      expect.objectContaining({
        name: "Flat buyer",
        due: 0,
        receivable: 15_000_00,
        balance: -15_000_00,
      }),
    ]);
    // The party screens' own reads agree: balances across Projects, and
    // overdue and advance summed over each Project.
    for (const partyType of [
      "contractor",
      "supplier",
      "other_party",
    ] as const) {
      actAs(owner);
      const theirs = (await (
        await workspacePartyBalances(
          new Request(
            `${TEST_ORIGIN}/api/construction/finance/party-balances?partyType=${partyType}`,
          ),
        )
      ).json()) as { items: { party: { id: string }; balance: number }[] };
      expect(
        Object.fromEntries(
          all.parties[partyType].map((row) => [row.partyId, row.balance]),
        ),
      ).toEqual(
        Object.fromEntries(
          theirs.items
            .filter((item) => item.balance !== 0)
            .map((item) => [item.party.id, item.balance]),
        ),
      );
    }
    let overdue = 0;
    let advance = 0;
    for (const projectId of [tower, villa]) {
      actAs(owner);
      const place = (await (
        await listPartyBalances(
          new Request(
            `${TEST_ORIGIN}/api/construction/finance/parties?partyType=contractor&projectId=${projectId}`,
          ),
        )
      ).json()) as {
        items: { party: { id: string }; overdue: number; advance: number }[];
      };
      const row = place.items.find((item) => item.party.id === velan);
      overdue += row?.overdue ?? 0;
      advance += row?.advance ?? 0;
    }
    expect({ overdue, advance }).toEqual({
      overdue: all.parties.contractor[0]?.overdue,
      advance: all.parties.contractor[0]?.advance,
    });
    expect(all.reports).toEqual({
      ledger: { company: true, pettyCash: true },
      tds194c: true,
      duePayments: true,
    });

    // A member on Tower A sees Tower A's money only.
    const member = await addMember(ws, by, {
      "finance.central_payment": ["read"],
    });
    await prisma.constructionOrganizationTeamMemberProject.create({
      data: { memberId: member.memberId, projectId: tower },
    });
    const actor: Actor = {
      userId: member.userId,
      workspaceId: ws,
      role: "member",
    };
    const mine = await summary(actor);
    expect(mine.allProjects).toBe(false);
    expect(mine.projectCount).toBe(1);
    expect(mine.parties.contractor).toEqual([
      expect.objectContaining({
        projectCount: 1,
        invoiced: 60_000_00,
        due: 40_000_00,
        overdue: 40_000_00,
        advance: 5_000_00,
        balance: 35_000_00,
      }),
    ]);
    expect(mine.parties.supplier).toEqual([]);
    expect(mine.parties.other_party).toHaveLength(1);
    // No account or petty-cash menus: those parts are null.
    expect(mine.accounts).toBeNull();
    expect(mine.pettyCash).toBeNull();
    expect(mine.reports).toEqual({
      ledger: { company: false, pettyCash: false },
      tds194c: false,
      duePayments: false,
    });
    // A member on no Project sees no party.
    const nowhere = await addMember(ws, by, {
      "finance.central_payment": ["read"],
    });
    const empty = await summary({
      userId: nowhere.userId,
      workspaceId: ws,
      role: "member",
    });
    expect(empty.parties).toEqual({
      contractor: [],
      supplier: [],
      other_party: [],
    });
  });

  it("counts nothing from a payment dated after today", async () => {
    const company = await newCompany();
    const ws = company.workspaceId;
    const by = company.ownerId;
    const tower = await addProject(ws, by, "Tower A");
    const { bankId } = await seededAccounts(ws);
    const velan = await addContractor(ws, by, [tower]);
    await reportPartyPayment(ws, by, {
      partyType: "contractor",
      partyId: velan,
      projectId: tower,
      accountId: bankId,
      date: addDays(todayIn("Asia/Kolkata"), 3),
      amount: 10_000_00n,
    });
    const today = await summary({ userId: by, workspaceId: ws, role: "owner" });
    // Dues, advance and balance are all as on today, so a payment dated
    // ahead leaves nothing to show yet.
    expect(today.parties.contractor).toEqual([]);
  });

  it("company accounts with today's balance and pending; petty cash by holder", async () => {
    const company = await newCompany();
    const ws = company.workspaceId;
    const by = company.ownerId;
    const owner: Actor = { userId: by, workspaceId: ws, role: "owner" };
    const tower = await addProject(ws, by, "Tower A");
    const { cashId, bankId } = await seededAccounts(ws);
    const today = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Kolkata",
    }).format(new Date());
    await reportTransaction(ws, by, {
      accountId: bankId,
      projectId: tower,
      date: "2026-01-05",
      amount: 80_000_00n,
      type: "payment_in",
    });
    await reportTransfer(ws, by, {
      fromAccountId: bankId,
      toAccountId: cashId,
      projectId: null,
      date: "2026-01-06",
      amount: 10_000_00n,
    });
    // Pending: a payment out of cash, a transfer into cash, an expense.
    await reportTransaction(ws, by, {
      accountId: cashId,
      projectId: tower,
      date: today,
      amount: 2_000_00n,
      status: "pending",
    });
    await reportTransfer(ws, by, {
      fromAccountId: bankId,
      toAccountId: cashId,
      projectId: null,
      date: today,
      amount: 5_000_00n,
      status: "pending",
    });
    await reportOtherExpense(ws, by, {
      accountId: cashId,
      projectId: tower,
      date: today,
      amount: 500_00n,
      status: "pending",
    });
    const holder = await addMember(ws, by, {
      "finance.central_payment": ["read"],
      "finance.petty_cash": ["read"],
    });
    const pettyCash = await addAccount(ws, by, {
      kind: "petty_cash",
      holderMemberId: holder.memberId,
      name: "Site petty cash",
    });
    const other = await addMember(ws, by, {});
    await addAccount(ws, by, {
      kind: "petty_cash",
      holderMemberId: other.memberId,
      name: "Office petty cash",
    });
    await reportVoucher(ws, by, {
      accountId: pettyCash,
      projectId: tower,
      date: "2026-01-07",
      amount: 300_00n,
    });
    await reportVoucher(ws, by, {
      accountId: pettyCash,
      projectId: tower,
      date: "2026-01-08",
      amount: 200_00n,
      status: "pending",
    });

    const body = await summary(owner);
    expect(body.accounts).toEqual([
      expect.objectContaining({
        id: cashId,
        kind: "cash",
        isPrimary: true,
        balance: 10_000_00,
        pendingTotal: 2_500_00,
        pendingCount: 3,
      }),
      expect.objectContaining({
        id: bankId,
        kind: "bank",
        balance: 70_000_00,
        pendingTotal: -5_000_00,
        pendingCount: 1,
      }),
    ]);
    expect(body.pettyCash?.map((account) => account.name).sort()).toEqual([
      "Office petty cash",
      "Site petty cash",
    ]);
    const own = await summary({
      userId: holder.userId,
      workspaceId: ws,
      role: "member",
    });
    expect(own.pettyCash).toEqual([
      expect.objectContaining({
        name: "Site petty cash",
        isOwn: true,
        balance: -300_00,
        pendingTotal: -200_00,
        pendingCount: 1,
        lastVoucherDate: "2026-01-08",
      }),
    ]);
  });

  it("needs Central payment Read", async () => {
    const company = await newCompany();
    const member = await addMember(company.workspaceId, company.ownerId, {
      "finance.parties": ["read", "report"],
    } satisfies Record<string, Flag[]>);
    expect(
      (
        await read({
          userId: member.userId,
          workspaceId: company.workspaceId,
          role: "member",
        })
      ).status,
    ).toBe(StatusCodes.FORBIDDEN);
    const document = (await getOpenApi().json()) as {
      paths: Record<string, unknown>;
    };
    expect(document.paths).toHaveProperty(
      "/api/construction/finance/central-payment",
    );
  });
});
