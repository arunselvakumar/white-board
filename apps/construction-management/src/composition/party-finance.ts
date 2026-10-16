import { prisma, Prisma, type PrismaClient } from "@repo/construction-db";

import {
  createPartyFinance,
  type PartyFinance,
} from "@/src/finance/infrastructure/party-finance-factory";
import type { PartyUsage } from "@/src/masters/application/party-handlers";
import type { GoodsReceiptPayments } from "@/src/procurement/application/ports";
import type { GoodsReceiptPosted } from "@/src/procurement/domain/events";
import { procurementEvents } from "@/src/composition/procurement-events";
import {
  InProcessEventDispatcher,
  type DomainEvent,
  type DomainEventListener,
  type EventDispatcher,
} from "@/src/shared-kernel/events";

import { financeDirectory } from "./finance-directory";
import { messagingEvents } from "./messaging";

let shared: PartyFinance | null = null;

/** The party money engine with the composition root's directory (CM-705). */
export function partyFinance(): PartyFinance {
  shared ??= createPartyFinance({
    directory: financeDirectory,
    events: messagingEvents(),
  });
  return shared;
}

function isGoodsReceiptPosted(event: DomainEvent): event is GoodsReceiptPosted {
  return event.type === "procurement.goods_receipt_posted";
}

/**
 * Finance listens to `GoodsReceiptPosted` (ADR CM-0017 §13). The GRN
 * handlers dispatch after their transaction commits, so the sync runs in
 * its own transaction, reads the GRN as committed and is idempotent by GRN
 * id. A failure is logged and never fails the GRN request: the GRN then
 * shows under "awaiting invoice" and the next edit syncs again.
 */
export function goodsReceiptInvoiceListener(
  finance: () => PartyFinance = partyFinance,
): DomainEventListener {
  return {
    async handle(event) {
      if (!isGoodsReceiptPosted(event)) return;
      try {
        await finance().goodsReceipts.sync(
          event.workspaceId,
          event.goodsReceiptId,
        );
      } catch (error) {
        console.error("Supplier invoice sync failed for a Goods Receipt", {
          goodsReceiptId: event.goodsReceiptId,
          error,
        });
      }
    },
  };
}

/**
 * The dispatcher the Goods Receipt handlers use: every event goes on to
 * `procurementEvents` (where M9's listeners will register), and
 * `GoodsReceiptPosted` also reaches finance.
 */
export function goodsReceiptDispatcher(): EventDispatcher {
  return new InProcessEventDispatcher([
    { handle: (event) => procurementEvents.dispatch([event]) },
    goodsReceiptInvoiceListener(),
  ]);
}

/**
 * A GRN is paid once a live payment allocation points at its live invoice
 * (ADR CM-0017 §13); procurement then refuses to edit or delete it.
 */
export function financeGoodsReceiptPayments(): GoodsReceiptPayments {
  return {
    async isPaid(db, workspaceId, goodsReceiptId) {
      const rows = await db.$queryRaw<{ paid: boolean }[]>(Prisma.sql`
        SELECT EXISTS (
          SELECT 1 FROM construction_finance.invoice_goods_receipts l
          JOIN construction_finance.invoices i ON i.id = l.invoice_id
          JOIN construction_finance.payment_allocations a ON a.invoice_id = i.id
          WHERE l.workspace_id = ${workspaceId}
            AND l.goods_receipt_id = ${goodsReceiptId}::uuid
            AND l.deleted_at IS NULL AND i.deleted_at IS NULL
            AND a.deleted_at IS NULL
        ) AS paid
      `);
      return rows[0]?.paid === true;
    },
  };
}

/**
 * Whether finance points at a Contractor or Supplier (CM-705): a live
 * invoice, party payment or opening balance keeps it from being deleted.
 */
export function financePartyUsage(db: PrismaClient = prisma): PartyUsage {
  return async (kind, workspaceId, id) => {
    const rows = await db.$queryRaw<{ used: boolean }[]>(Prisma.sql`
      SELECT EXISTS (
        SELECT 1 FROM construction_finance.invoices
        WHERE workspace_id = ${workspaceId} AND deleted_at IS NULL
          AND party_type = ${kind}::construction_finance.party_type
          AND party_id = ${id}::uuid
      ) OR EXISTS (
        SELECT 1 FROM construction_finance.party_payments
        WHERE workspace_id = ${workspaceId} AND deleted_at IS NULL
          AND party_type = ${kind}::construction_finance.party_type
          AND party_id = ${id}::uuid
      ) OR EXISTS (
        SELECT 1 FROM construction_finance.party_openings
        WHERE workspace_id = ${workspaceId} AND deleted_at IS NULL
          AND party_type = ${kind}::construction_finance.party_type
          AND party_id = ${id}::uuid
      ) AS used
    `);
    return rows[0]?.used === true;
  };
}
