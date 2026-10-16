import type { MemberAccess } from "@/src/shared-kernel/access";
import {
  APPROVAL_LIMITS,
  bulkRefused,
  type ApprovalStatus,
  type BulkRefusal,
} from "@/src/shared-kernel/approval";
import type { CalendarDate } from "@/src/shared-kernel/calendar-date";
import { DomainError } from "@/src/shared-kernel/domain-error";
import type { ListCursor } from "@/src/shared-kernel/list-cursor";

import type { CounterpartyKind, PaymentMode } from "../domain/ledger";
import type { ClosingCheck, FinanceDb, Tx } from "./account-handlers";
import type {
  StoredTransaction,
  TransactionHandlers,
  TransactionReadModel,
} from "./transaction-handlers";
import type {
  StoredTransfer,
  TransferHandlers,
  TransferReadModel,
} from "./transfer-handlers";

/**
 * The Transactions register (CM-702): Transactions and transfers in one
 * list, newest first, with filters and the in / out totals of what is
 * listed; bulk approve or reject across both, all or none.
 */

export type RegisterType = "in" | "out" | "transfer";
export type RegisterDocumentType = "transaction" | "transfer";

export type RegisterFilters = {
  workspaceId: string;
  /** Null: every place in the Company (the Owner's company-wide list). */
  projectId: string | null;
  from?: CalendarDate;
  to?: CalendarDate;
  type?: RegisterType;
  /** A Transaction's account, or either side of a transfer. */
  accountId?: string;
  paymentCategoryId?: string;
  mode?: PaymentMode;
  counterpartyKind?: CounterpartyKind;
  approvalStatus?: ApprovalStatus;
  limit: number;
  after?: ListCursor;
  before?: ListCursor;
};

export type RegisterRow =
  | { type: "transaction"; row: StoredTransaction }
  | { type: "transfer"; row: StoredTransfer };

/**
 * Paise of the listed rows that are not rejected (only the rejected ones
 * when the filter asks for them): Payment In, Payment Out, and transfers.
 */
export type RegisterTotals = { in: bigint; out: bigint; transfer: bigint };

export type RegisterStore = {
  list(
    db: Tx,
    filters: RegisterFilters,
  ): Promise<{
    items: RegisterRow[];
    hasMore: boolean;
    total: number;
    totals: RegisterTotals;
  }>;
};

export type RegisterItem =
  | { type: "transaction"; item: TransactionReadModel }
  | { type: "transfer"; item: TransferReadModel };

export type BulkDecision =
  { approve: true } | { approve: false; reason: string };

export class TransactionRegister {
  private readonly clock: () => Date;

  constructor(
    private readonly deps: {
      db: FinanceDb;
      store: RegisterStore;
      transactions: TransactionHandlers;
      transfers: TransferHandlers;
      closing: (workspaceId: string) => Promise<ClosingCheck>;
      clock?: () => Date;
    },
  ) {
    this.clock = deps.clock ?? (() => new Date());
  }

  async list(access: MemberAccess, filters: RegisterFilters) {
    const page = await this.deps.store.list(this.deps.db, filters);
    const transactions = await this.deps.transactions.readModels(
      access,
      page.items.flatMap((item) =>
        item.type === "transaction" ? [item.row] : [],
      ),
    );
    const transfers = await this.deps.transfers.readModels(
      access,
      page.items.flatMap((item) =>
        item.type === "transfer" ? [item.row] : [],
      ),
    );
    const byId = new Map<string, RegisterItem>([
      ...transactions.map(
        (item) => [item.id, { type: "transaction", item }] as const,
      ),
      ...transfers.map(
        (item) => [item.id, { type: "transfer", item }] as const,
      ),
    ]);
    return {
      items: page.items.flatMap((entry) => byId.get(entry.row.id) ?? []),
      hasMore: page.hasMore,
      total: page.total,
      totals: page.totals,
    };
  }

  /**
   * Approve or reject several Transactions and transfers in one
   * transaction: when any refuses (not pending, no flag on its Project,
   * the books closed), nothing changes and the 409 lists each refusal.
   */
  async bulkDecide(
    access: MemberAccess,
    items: readonly { type: RegisterDocumentType; id: string }[],
    decision: BulkDecision,
  ): Promise<{ decided: number }> {
    const unique = [
      ...new Map(
        items.map((item) => [`${item.type}:${item.id}`, item]),
      ).values(),
    ];
    if (unique.length === 0)
      throw new DomainError("BULK_EMPTY", "Choose at least one.");
    if (unique.length > APPROVAL_LIMITS.maxBulk)
      throw new DomainError(
        "BULK_TOO_MANY",
        `Choose at most ${String(APPROVAL_LIMITS.maxBulk)} at a time.`,
      );
    const closing = await this.deps.closing(access.workspaceId);
    const at = this.clock();
    const decided: StoredTransaction[] = [];
    await this.deps.db.$transaction(async (tx) => {
      const refusals: BulkRefusal[] = [];
      for (const item of unique) {
        try {
          if (item.type === "transaction")
            decided.push(
              await this.deps.transactions.decideIn(
                tx,
                access,
                item.id,
                decision,
                closing,
                null,
                at,
              ),
            );
          else
            await this.deps.transfers.decideIn(
              tx,
              access,
              item.id,
              decision,
              closing,
              null,
              at,
            );
        } catch (error) {
          if (!(error instanceof DomainError)) throw error;
          refusals.push({
            id: item.id,
            code: error.code,
            message: error.message,
          });
        }
      }
      if (refusals.length > 0) throw bulkRefused(refusals);
    });
    // CM-904: after commit; account transfers raise no approval events.
    await this.deps.transactions.dispatchApproval(
      decided,
      decision.approve
        ? { kind: "approved" }
        : { kind: "rejected", reason: null },
      access.userId,
      at,
    );
    return { decided: unique.length };
  }
}
