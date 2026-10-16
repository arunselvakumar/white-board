import { prisma } from "@repo/construction-db";

import type { AccessSession } from "@/app/api/_lib/require-access";
import { requireAccess } from "@/app/api/_lib/require-access";
import {
  isResponse,
  requireCompanySession,
} from "@/app/api/_lib/require-session";
import { financeDirectory } from "@/src/composition/finance-directory";
import { messagingEvents } from "@/src/composition/messaging";
import {
  scopeOf,
  TRANSACTIONS_MENU,
} from "@/src/finance/application/transaction-common";
import {
  TransactionHandlers,
  type StoredTransaction,
  type TransactionReadModel,
} from "@/src/finance/application/transaction-handlers";
import type { ImportDeps } from "@/src/finance/application/transaction-import";
import { TransactionRegister } from "@/src/finance/application/transaction-register";
import {
  TransferHandlers,
  type StoredTransfer,
  type TransferReadModel,
} from "@/src/finance/application/transfer-handlers";
import { lockedAccountFacts } from "@/src/finance/infrastructure/account-facts";
import {
  loadClosingCheck,
  loadFinanceBackdatedCheck,
} from "@/src/finance/infrastructure/account-guards";
import { accountLedger } from "@/src/finance/infrastructure/account-ledger";
import { prismaRegisterStore } from "@/src/finance/infrastructure/transaction-register-store";
import {
  prismaTransactionLookups,
  prismaTransactionStore,
} from "@/src/finance/infrastructure/transaction-store";
import { prismaImportNames } from "@/src/finance/infrastructure/transaction-workbook";
import { prismaTransferStore } from "@/src/finance/infrastructure/transfer-store";
import type { Flag } from "@/src/shared-kernel/access";

import type {
  ConstructionFinanceTransactionResponseModel,
  ConstructionFinanceTransferResponseModel,
} from "./transaction-models";

export const MENU = TRANSACTIONS_MENU;

const shared = {
  db: prisma,
  lookups: prismaTransactionLookups,
  directory: financeDirectory,
  ledger: accountLedger,
  accountFacts: (
    tx: Parameters<typeof lockedAccountFacts>[0],
    workspaceId: string,
    accountId: string,
  ) => lockedAccountFacts(tx, financeDirectory, workspaceId, accountId),
  backdated: (access: Parameters<typeof loadFinanceBackdatedCheck>[1]) =>
    loadFinanceBackdatedCheck(prisma, access),
  closing: (workspaceId: string) => loadClosingCheck(prisma, workspaceId),
};

/** One set of Transactions and transfer handlers for every route (CM-702). */
export const transactionHandlers = new TransactionHandlers({
  ...shared,
  store: prismaTransactionStore,
  events: messagingEvents(),
});

export const transferHandlers = new TransferHandlers({
  ...shared,
  store: prismaTransferStore,
});

export const transactionRegister = new TransactionRegister({
  db: prisma,
  store: prismaRegisterStore,
  transactions: transactionHandlers,
  transfers: transferHandlers,
  closing: shared.closing,
});

export const importDeps: ImportDeps = {
  db: prisma,
  transactions: transactionHandlers,
  backdated: shared.backdated,
  names: prismaImportNames,
};

/**
 * The Session plus the Permission Matrix check for a route about one
 * Transaction: loaded first (404 for another Company's or a deleted one),
 * then `flag` on its Project (the flag alone for a Store or Company-level
 * one).
 */
export async function requireTransactionAccess(
  request: Request,
  id: string,
  flag: Flag,
): Promise<(AccessSession & { target: StoredTransaction }) | Response> {
  const session = await requireCompanySession(request);
  if (isResponse(session)) return session;
  const target = await transactionHandlers.find(session.workspaceId, id);
  const access = await requireAccess(request, MENU, flag, scopeOf(target));
  if (isResponse(access)) return access;
  return { ...access, target };
}

export async function requireTransferAccess(
  request: Request,
  id: string,
  flag: Flag,
): Promise<(AccessSession & { target: StoredTransfer }) | Response> {
  const session = await requireCompanySession(request);
  if (isResponse(session)) return session;
  const target = await transferHandlers.find(session.workspaceId, id);
  const access = await requireAccess(request, MENU, flag, scopeOf(target));
  if (isResponse(access)) return access;
  return { ...access, target };
}

type AccountKindModel = "cash" | "bank" | "petty_cash";

function kindOf(kind: string | null): AccountKindModel | null {
  return kind === "cash" || kind === "bank" || kind === "petty_cash"
    ? kind
    : null;
}

export function toTransactionResponse(
  row: TransactionReadModel,
): ConstructionFinanceTransactionResponseModel {
  return {
    type: "transaction",
    id: row.id,
    number: row.number,
    projectId: row.projectId,
    projectName: row.projectName,
    storeId: row.storeId,
    storeName: row.storeName,
    transactionDate: row.transactionDate,
    direction: row.type,
    account: {
      id: row.accountId,
      name: row.accountName,
      kind: kindOf(row.accountKind),
    },
    paymentCategoryId: row.paymentCategoryId,
    paymentCategoryName: row.paymentCategoryName,
    mode: row.mode,
    chequeNumber: row.chequeNumber,
    reference: row.reference,
    modeDate: row.modeDate,
    counterparty:
      row.counterpartyName == null
        ? null
        : {
            kind: row.counterpartyKind,
            id: row.counterpartyId,
            name: row.counterpartyName,
          },
    amount: Number(row.amount),
    description: row.description,
    approvalStatus: row.approvalStatus,
    rejectReason: row.rejectReason,
    decidedAt: row.decidedAt?.toISOString() ?? null,
    decidedByName: row.decidedByName,
    importBatchId: row.importBatchId,
    createdAt: row.createdAt.toISOString(),
    createdByName: row.createdByName,
    updatedAt: row.updatedAt.toISOString(),
    actions: row.actions,
  };
}

export function toTransferResponse(
  row: TransferReadModel,
): ConstructionFinanceTransferResponseModel {
  return {
    type: "transfer",
    id: row.id,
    number: row.number,
    projectId: row.projectId,
    projectName: row.projectName,
    transferDate: row.transferDate,
    fromAccount: {
      id: row.fromAccountId,
      name: row.fromAccountName,
      kind: kindOf(row.fromAccountKind),
    },
    toAccount: {
      id: row.toAccountId,
      name: row.toAccountName,
      kind: kindOf(row.toAccountKind),
    },
    mode: row.mode,
    reference: row.reference,
    amount: Number(row.amount),
    description: row.description,
    approvalStatus: row.approvalStatus,
    rejectReason: row.rejectReason,
    decidedAt: row.decidedAt?.toISOString() ?? null,
    decidedByName: row.decidedByName,
    createdAt: row.createdAt.toISOString(),
    createdByName: row.createdByName,
    updatedAt: row.updatedAt.toISOString(),
    actions: row.actions,
  };
}
