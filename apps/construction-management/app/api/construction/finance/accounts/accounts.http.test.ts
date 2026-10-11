import { prisma } from "@repo/construction-db";
import { StatusCodes } from "http-status-codes";
import { describe, expect, it, vi } from "vitest";

import { accountLedger } from "@/src/finance/infrastructure/account-ledger";
import { calendarDateToDb, todayIn } from "@/src/shared-kernel/calendar-date";
import { newId } from "@/src/shared-kernel/ids";
import { actAs, addMember, newCompany } from "@/test/companies";
import { accountBalance, addAccount, seededAccounts } from "@/test/finance";

import { POST as remove } from "./[id]/delete/route";
import { GET as getOne } from "./[id]/route";
import { POST as setPrimary } from "./[id]/set-primary/route";
import { GET as statement } from "./[id]/statement/route";
import { POST as update } from "./[id]/update/route";
import { GET as list, POST as create } from "./route";

vi.mock(import("@repo/auth/construction/server"), async (importOriginal) => ({
  ...(await importOriginal()),
  getCompanyAuthFromHeaders: vi.fn(),
}));

const BASE = "http://localhost/api/construction/finance/accounts";
const TODAY = todayIn("Asia/Kolkata");

type Account = {
  id: string;
  kind: string;
  name: string;
  ifsc: string | null;
  isPrimary: boolean;
  openingBalance: number;
  openingDate: string;
  balance: number;
  pending: { count: number; total: number };
  updatedAt: string;
};

function post(url: string, body: unknown): Request {
  return new Request(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const params = (id: string) => ({ params: Promise.resolve({ id }) });

async function listAccounts(): Promise<Account[]> {
  const response = await list(new Request(BASE));
  expect(response.status).toBe(StatusCodes.OK);
  return ((await response.json()) as { items: Account[] }).items;
}

async function createAccount(body: Record<string, unknown>): Promise<Response> {
  return create(
    post(BASE, {
      kind: "bank",
      name: `HDFC ${newId().slice(-6)}`,
      openingBalance: 0,
      openingDate: TODAY,
      ...body,
    }),
  );
}

async function owner() {
  const company = await newCompany();
  actAs({ userId: company.ownerId, workspaceId: company.workspaceId });
  return company;
}

describe("Company's Bank A/C (CM-701)", () => {
  it("lists the seeded accounts, primary first, with zero balances", async () => {
    await owner();
    const items = await listAccounts();
    expect(
      items.map((item) => [item.name, item.isPrimary, item.balance]),
    ).toEqual([
      ["Company's Cash Account", true, 0],
      ["Company's Bank Account", false, 0],
    ]);
  });

  it("adds a Bank account with an opening entry and an upper-cased IFSC", async () => {
    const company = await owner();
    const response = await createAccount({
      name: "HDFC Current",
      bankName: "HDFC Bank",
      accountNumber: "5010 0123 4567 89",
      ifsc: "hdfc0001234",
      branch: "Anna Nagar",
      openingBalance: 2_50_000_00,
    });
    expect(response.status).toBe(StatusCodes.CREATED);
    const account = (await response.json()) as Account & {
      accountNumber: string;
    };
    expect(account.ifsc).toBe("HDFC0001234");
    expect(account.accountNumber).toBe("50100123456789");
    expect(account.openingBalance).toBe(2_50_000_00);
    expect(account.balance).toBe(2_50_000_00);
    expect(await accountBalance(company.workspaceId, account.id)).toBe(
      2_50_000_00n,
    );
    const entries = await prisma.constructionFinanceAccountEntry.findMany({
      where: { accountId: account.id },
    });
    expect(entries.map((entry) => [entry.kind, entry.sourceType])).toEqual([
      ["opening", "account"],
    ]);
  });

  it("refuses a bad IFSC, bank fields on Cash and a name already used", async () => {
    await owner();
    const ifsc = await createAccount({ ifsc: "HDFC1234567" });
    expect(ifsc.status).toBe(StatusCodes.BAD_REQUEST);
    expect(((await ifsc.json()) as { code: string }).code).toBe("IFSC_INVALID");

    const cash = await createAccount({ kind: "cash", bankName: "SBI" });
    expect(((await cash.json()) as { code: string }).code).toBe(
      "BANK_FIELDS_NOT_ALLOWED",
    );

    const taken = await createAccount({ name: "company's BANK account" });
    expect(taken.status).toBe(StatusCodes.CONFLICT);
    expect(((await taken.json()) as { code: string }).code).toBe(
      "ACCOUNT_NAME_TAKEN",
    );
  });

  it("changing the opening reverses the old entry and posts a new one", async () => {
    const company = await owner();
    const created = (await (
      await createAccount({ openingBalance: 10_000_00 })
    ).json()) as Account;
    const response = await update(
      post(`${BASE}/${created.id}/update`, {
        name: "Renamed",
        openingBalance: 15_000_00,
        openingDate: TODAY,
        expectedUpdatedAt: created.updatedAt,
      }),
      params(created.id),
    );
    expect(response.status).toBe(StatusCodes.OK);
    const updated = (await response.json()) as Account;
    expect(updated.name).toBe("Renamed");
    expect(updated.openingBalance).toBe(15_000_00);
    expect(await accountBalance(company.workspaceId, created.id)).toBe(
      15_000_00n,
    );
    const amounts = (
      await prisma.constructionFinanceAccountEntry.findMany({
        where: { accountId: created.id },
        orderBy: { createdAt: "asc" },
      })
    ).map((entry) => Number(entry.amount));
    expect(amounts).toEqual([10_000_00, -10_000_00, 15_000_00]);

    const stale = await update(
      post(`${BASE}/${created.id}/update`, {
        name: "Again",
        openingBalance: 0,
        openingDate: TODAY,
        expectedUpdatedAt: created.updatedAt,
      }),
      params(created.id),
    );
    expect(stale.status).toBe(StatusCodes.CONFLICT);
    expect(((await stale.json()) as { code: string }).code).toBe(
      "ACCOUNT_CHANGED",
    );
  });

  it("moves the primary flag and refuses to delete the primary", async () => {
    const company = await owner();
    const { cashId, bankId } = await seededAccounts(company.workspaceId);
    const moved = await setPrimary(
      post(`${BASE}/${bankId}/set-primary`, {}),
      params(bankId),
    );
    expect(moved.status).toBe(StatusCodes.OK);
    const items = await listAccounts();
    expect(
      items.filter((item) => item.isPrimary).map((item) => item.id),
    ).toEqual([bankId]);
    const cash = items.find((item) => item.id === cashId);
    const primary = items.find((item) => item.id === bankId);
    const refused = await remove(
      post(`${BASE}/${bankId}/delete`, {
        expectedUpdatedAt: primary?.updatedAt,
      }),
      params(bankId),
    );
    expect(refused.status).toBe(StatusCodes.CONFLICT);
    expect(((await refused.json()) as { code: string }).code).toBe(
      "ACCOUNT_PRIMARY",
    );
    // The old primary is now an ordinary account with no entries: deletable.
    const deleted = await remove(
      post(`${BASE}/${cashId}/delete`, { expectedUpdatedAt: cash?.updatedAt }),
      params(cashId),
    );
    expect(deleted.status).toBe(StatusCodes.NO_CONTENT);
  });

  it("refuses to delete an account money moved through or a document names", async () => {
    const company = await owner();
    const used = (await (await createAccount({})).json()) as Account;
    await prisma.$transaction((tx) =>
      accountLedger.post(tx, company.workspaceId, company.ownerId, [
        {
          accountId: used.id,
          projectId: null,
          entryDate: TODAY,
          kind: "receipt",
          amount: 500_00n,
          sourceType: "transaction",
          sourceId: newId(),
        },
      ]),
    );
    const inUse = await remove(
      post(`${BASE}/${used.id}/delete`, { expectedUpdatedAt: used.updatedAt }),
      params(used.id),
    );
    expect(((await inUse.json()) as { code: string }).code).toBe(
      "ACCOUNT_IN_USE",
    );

    const named = (await (await createAccount({})).json()) as Account;
    await prisma.constructionFinanceTransaction.create({
      data: {
        id: newId(),
        workspaceId: company.workspaceId,
        number: "TXN/26-27/09999",
        transactionDate: calendarDateToDb(TODAY),
        type: "payment_out",
        accountId: named.id,
        mode: "online",
        reference: "UTR1",
        amount: 1_000_00n,
        createdBy: company.ownerId,
        updatedBy: company.ownerId,
      },
    });
    expect(
      (await listAccounts()).find((item) => item.id === named.id)?.pending,
    ).toEqual({ count: 1, total: -1_000_00 });
    const pendingDoc = await remove(
      post(`${BASE}/${named.id}/delete`, {
        expectedUpdatedAt: named.updatedAt,
      }),
      params(named.id),
    );
    expect(pendingDoc.status).toBe(StatusCodes.CONFLICT);
    expect(
      ((await pendingDoc.json()) as { message: string }).message,
    ).toContain("TXN/26-27/09999");

    // Unused with an opening: the opening is reversed, the row tombstoned.
    const fresh = (await (
      await createAccount({ openingBalance: 700_00 })
    ).json()) as Account;
    const ok = await remove(
      post(`${BASE}/${fresh.id}/delete`, {
        expectedUpdatedAt: fresh.updatedAt,
      }),
      params(fresh.id),
    );
    expect(ok.status).toBe(StatusCodes.NO_CONTENT);
    expect(await accountBalance(company.workspaceId, fresh.id)).toBe(0n);
    const gone = await getOne(
      new Request(`${BASE}/${fresh.id}`),
      params(fresh.id),
    );
    expect(gone.status).toBe(StatusCodes.NOT_FOUND);
  });

  it("needs Company's Bank A/C flags", async () => {
    const company = await newCompany();
    const reader = await addMember(company.workspaceId, company.ownerId, {
      "masters.bank_accounts": ["read"],
    });
    actAs({
      userId: reader.userId,
      workspaceId: company.workspaceId,
      role: "member",
    });
    expect((await list(new Request(BASE))).status).toBe(StatusCodes.OK);
    expect((await createAccount({})).status).toBe(StatusCodes.FORBIDDEN);
    const nobody = await addMember(company.workspaceId, company.ownerId, {});
    actAs({
      userId: nobody.userId,
      workspaceId: company.workspaceId,
      role: "member",
    });
    expect((await list(new Request(BASE))).status).toBe(StatusCodes.FORBIDDEN);
  });
});

describe("Account statement (CM-701)", () => {
  it("shows opening, running balance and closing for a period", async () => {
    const company = await owner();
    const { bankId } = await seededAccounts(company.workspaceId);
    const post = (date: string, amount: bigint) =>
      prisma.$transaction((tx) =>
        accountLedger.post(tx, company.workspaceId, company.ownerId, [
          {
            accountId: bankId,
            projectId: null,
            entryDate: date,
            kind: amount > 0n ? "receipt" : "payment",
            amount,
            mode: "online",
            reference: `UTR-${date}`,
            counterpartyName: "Bank charges",
            documentNumber: "TXN/26-27/00001",
            sourceType: "transaction",
            sourceId: newId(),
          },
        ]),
      );
    await post("2026-08-20", 1_000_00n);
    await post("2026-09-02", 500_00n);
    await post("2026-09-15", -200_00n);
    await post("2026-10-01", 50_00n);

    const response = await statement(
      new Request(`${BASE}/${bankId}/statement?from=2026-09-01&to=2026-09-30`),
      params(bankId),
    );
    expect(response.status).toBe(StatusCodes.OK);
    const body = (await response.json()) as {
      account: { name: string };
      opening: number;
      entries: { amount: number; balance: number; reference: string }[];
      totalIn: number;
      totalOut: number;
      closing: number;
    };
    expect(body.account.name).toBe("Company's Bank Account");
    expect(body.opening).toBe(1_000_00);
    expect(body.entries.map((line) => [line.amount, line.balance])).toEqual([
      [500_00, 1_500_00],
      [-200_00, 1_300_00],
    ]);
    expect(body.totalIn).toBe(500_00);
    expect(body.totalOut).toBe(200_00);
    expect(body.closing).toBe(1_300_00);

    const tooLong = await statement(
      new Request(`${BASE}/${bankId}/statement?from=2025-01-01&to=2026-09-30`),
      params(bankId),
    );
    expect(((await tooLong.json()) as { code: string }).code).toBe(
      "PERIOD_TOO_LONG",
    );
  });

  it("lets a holder read their petty cash but not someone else's", async () => {
    const company = await newCompany();
    const ravi = await addMember(company.workspaceId, company.ownerId, {
      "finance.petty_cash": ["read"],
    });
    const meena = await addMember(company.workspaceId, company.ownerId, {
      "finance.petty_cash": ["read"],
    });
    const raviPetty = await addAccount(company.workspaceId, company.ownerId, {
      kind: "petty_cash",
      holderMemberId: ravi.memberId,
    });
    const { bankId } = await seededAccounts(company.workspaceId);
    actAs({
      userId: ravi.userId,
      workspaceId: company.workspaceId,
      role: "member",
    });
    const own = await statement(
      new Request(`${BASE}/${raviPetty}/statement`),
      params(raviPetty),
    );
    expect(own.status).toBe(StatusCodes.OK);
    expect(
      ((await own.json()) as { account: { holderName: string } }).account
        .holderName,
    ).toBe("Prabhu Saravanan");
    // A company account needs Company's Bank A/C or Transactions read.
    const company403 = await statement(
      new Request(`${BASE}/${bankId}/statement`),
      params(bankId),
    );
    expect(company403.status).toBe(StatusCodes.FORBIDDEN);

    actAs({
      userId: meena.userId,
      workspaceId: company.workspaceId,
      role: "member",
    });
    const other = await statement(
      new Request(`${BASE}/${raviPetty}/statement`),
      params(raviPetty),
    );
    expect(other.status).toBe(StatusCodes.FORBIDDEN);
  });
});
