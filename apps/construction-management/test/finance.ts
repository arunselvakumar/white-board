import { prisma } from "@repo/construction-db";

import { accountLedger } from "@/src/finance/infrastructure/account-ledger";
import { calendarDateToDb, todayIn } from "@/src/shared-kernel/calendar-date";
import { newId } from "@/src/shared-kernel/ids";

/**
 * Finance test helpers (M7). Accounts are written straight to
 * `construction_finance.accounts`; every Company already has the seeded
 * "Company's Cash Account" (primary) and "Company's Bank Account".
 */

export async function seededAccounts(workspaceId: string): Promise<{
  cashId: string;
  bankId: string;
}> {
  const rows = await prisma.constructionFinanceAccount.findMany({
    where: { workspaceId, deletedAt: null, isSeed: true },
    select: { id: true, kind: true },
  });
  const cashId = rows.find((row) => row.kind === "cash")?.id;
  const bankId = rows.find((row) => row.kind === "bank")?.id;
  if (cashId == null || bankId == null)
    throw new Error("The Company has no seeded accounts.");
  return { cashId, bankId };
}

/** A company Bank or Cash account, or a Team Member's petty cash. */
export async function addAccount(
  workspaceId: string,
  by: string,
  input:
    | { kind: "cash" | "bank"; name?: string }
    | { kind: "petty_cash"; holderMemberId: string; name?: string },
): Promise<string> {
  const id = newId();
  await prisma.constructionFinanceAccount.create({
    data: {
      id,
      workspaceId,
      kind: input.kind,
      name: input.name ?? `${input.kind} ${id.slice(-6)}`,
      holderMemberId: "holderMemberId" in input ? input.holderMemberId : null,
      openingDate: calendarDateToDb(todayIn("Asia/Kolkata")),
      createdBy: by,
      updatedBy: by,
    },
  });
  return id;
}

/** An account's balance in paise (every entry). */
export async function accountBalance(
  workspaceId: string,
  accountId: string,
): Promise<bigint> {
  const balances = await prisma.$transaction((tx) =>
    accountLedger.balances(tx, workspaceId, [accountId]),
  );
  return balances.get(accountId) ?? 0n;
}
