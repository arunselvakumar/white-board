import { prisma } from "@repo/construction-db";

import { financeDirectory } from "@/src/composition/finance-directory";
import {
  AccountHandlers,
  type CompanyAccountReadModel,
} from "@/src/finance/application/account-handlers";
import { loadClosingCheck } from "@/src/finance/infrastructure/account-guards";
import { accountLedger } from "@/src/finance/infrastructure/account-ledger";
import type { AccountStatement } from "@/src/finance/infrastructure/account-statement";
import { prismaAccountStore } from "@/src/finance/infrastructure/account-store";
import { companyToday } from "@/src/shared-kernel/company-today";

import type {
  ConstructionFinanceAccountResponseModel,
  GetConstructionFinanceAccountStatementResponseModel,
} from "./account-models";

/** One set of Company's Bank A/C handlers for every route (CM-701). */
export const accountHandlers = new AccountHandlers({
  db: prisma,
  store: prismaAccountStore,
  ledger: accountLedger,
  closing: (workspaceId) => loadClosingCheck(prisma, workspaceId),
  today: (workspaceId) => companyToday(prisma, workspaceId),
});

export { financeDirectory };

export function toAccountResponse(
  account: CompanyAccountReadModel,
): ConstructionFinanceAccountResponseModel {
  return {
    id: account.id,
    kind: account.kind === "bank" ? "bank" : "cash",
    name: account.name,
    bankName: account.bankName,
    accountNumber: account.accountNumber,
    ifsc: account.ifsc,
    branch: account.branch,
    isPrimary: account.isPrimary,
    isSeed: account.isSeed,
    openingBalance: Number(account.openingBalance),
    openingDate: account.openingDate,
    balance: Number(account.balance),
    pending: {
      count: account.pending.count,
      total: Number(account.pending.total),
    },
    createdAt: account.createdAt.toISOString(),
    updatedAt: account.updatedAt.toISOString(),
  };
}

export function toStatementResponse(
  statement: AccountStatement,
): GetConstructionFinanceAccountStatementResponseModel {
  return {
    account: statement.account,
    from: statement.from,
    to: statement.to,
    opening: Number(statement.opening),
    entries: statement.entries.map((line) => ({
      ...line,
      amount: Number(line.amount),
      balance: Number(line.balance),
    })),
    totalIn: Number(statement.totalIn),
    totalOut: Number(statement.totalOut),
    closing: Number(statement.closing),
  };
}
