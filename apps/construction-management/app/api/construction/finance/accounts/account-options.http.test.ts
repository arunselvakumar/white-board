import { prisma } from "@repo/construction-db";
import { StatusCodes } from "http-status-codes";
import { describe, expect, it, vi } from "vitest";

import { actAs, addMember, newCompany } from "@/test/companies";
import { addAccount, seededAccounts } from "@/test/finance";

import { GET as options } from "./options/route";

vi.mock(import("@repo/auth/construction/server"), async (importOriginal) => ({
  ...(await importOriginal()),
  getCompanyAuthFromHeaders: vi.fn(),
}));

const BASE = "http://localhost/api/construction/finance/accounts/options";

type Options = {
  items: { id: string; kind: string; isPrimary: boolean; isOwn: boolean }[];
};

async function read(query = ""): Promise<Options> {
  const response = await options(new Request(`${BASE}${query}`));
  expect(response.status).toBe(StatusCodes.OK);
  return (await response.json()) as Options;
}

describe("finance accounts: seeds and the account picker (CM-701)", () => {
  it("gives a new Company a primary Cash account, a Bank account and the Payment Categories", async () => {
    const company = await newCompany();
    const accounts = await prisma.constructionFinanceAccount.findMany({
      where: { workspaceId: company.workspaceId },
      orderBy: { name: "asc" },
    });
    expect(accounts.map((row) => [row.name, row.kind, row.isPrimary])).toEqual([
      ["Company's Bank Account", "bank", false],
      ["Company's Cash Account", "cash", true],
    ]);
    const categories = await prisma.constructionFinancePaymentCategory.count({
      where: { workspaceId: company.workspaceId, isSeed: true },
    });
    expect(categories).toBe(25);
  });

  it("lists company accounts, primary first, and filters by mode", async () => {
    const company = await newCompany();
    const { cashId, bankId } = await seededAccounts(company.workspaceId);
    actAs({ userId: company.ownerId, workspaceId: company.workspaceId });

    expect((await read()).items.map((item) => item.id)).toEqual([
      cashId,
      bankId,
    ]);
    expect((await read("?mode=cash")).items.map((item) => item.id)).toEqual([
      cashId,
    ]);
    expect((await read("?mode=upi")).items.map((item) => item.id)).toEqual([
      bankId,
    ]);
  });

  it("shows a member only their own petty cash, and every one with View all", async () => {
    const company = await newCompany();
    const ravi = await addMember(company.workspaceId, company.ownerId, {
      "finance.petty_cash": ["create", "read"],
    });
    const meena = await addMember(company.workspaceId, company.ownerId, {
      "finance.petty_cash": ["create", "read", "view_all"],
    });
    const raviPetty = await addAccount(company.workspaceId, company.ownerId, {
      kind: "petty_cash",
      holderMemberId: ravi.memberId,
    });
    const meenaPetty = await addAccount(company.workspaceId, company.ownerId, {
      kind: "petty_cash",
      holderMemberId: meena.memberId,
    });

    actAs({
      userId: ravi.userId,
      workspaceId: company.workspaceId,
      role: "member",
    });
    const own = (await read("?mode=cash")).items;
    expect(own.map((item) => item.id)).toContain(raviPetty);
    expect(own.map((item) => item.id)).not.toContain(meenaPetty);
    expect(own.find((item) => item.id === raviPetty)?.isOwn).toBe(true);

    actAs({
      userId: meena.userId,
      workspaceId: company.workspaceId,
      role: "member",
    });
    const all = (await read("?mode=cash")).items.map((item) => item.id);
    expect(all).toEqual(expect.arrayContaining([raviPetty, meenaPetty]));
  });
});
