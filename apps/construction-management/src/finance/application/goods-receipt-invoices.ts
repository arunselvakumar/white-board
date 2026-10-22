import { recordAudit } from "@/src/shared-kernel/audit";
import { newId } from "@/src/shared-kernel/ids";

import { dueDateFromTerms, invoiceEntry } from "../domain/invoice";
import type { PartyPlace } from "../domain/party";
import { auditable } from "./party-common";
import type { FinanceTx, PartyFinanceDeps, StoredInvoice } from "./party-ports";
import type { GoodsReceiptFacts } from "./ports";

/** What the sync did, for logs and tests. */
export type GoodsReceiptSyncOutcome =
  | "created"
  | "updated"
  | "unchanged"
  | "deleted"
  | "unlinked"
  | "skipped_paid"
  | "skipped_number_taken"
  | "skipped_no_invoice"
  | "skipped_zero";

/**
 * Supplier invoices from Goods Receipts (CM-705, ADR CM-0017 §13). Called
 * by the `GoodsReceiptPosted` listener after the GRN's own transaction has
 * committed, so it reads the GRN as it now is and is idempotent by GRN id:
 *
 * - posted or edited with an invoice number, no invoice yet → a supplier
 *   invoice (origin `goods_receipt`): number, date (invoice date, else the
 *   receipt date), amount (invoice amount, else total value), due date by
 *   the PO's payment terms, linked with the GRN's value;
 * - edited, its own invoice unallocated and unsettled → the invoice follows
 *   the GRN (a changed amount or date is reversed and posted again); a
 *   removed invoice number deletes it, so the GRN awaits an invoice again;
 * - a manual invoice that gathered the GRN keeps its amount; only the
 *   link's GRN value follows;
 * - deleted → its own invoice is deleted when unallocated; a manual one
 *   just loses the link.
 *
 * Paid invoices are never touched (procurement refuses to edit or delete a
 * paid GRN anyway). A number the Supplier already used leaves the GRN
 * awaiting an invoice for the accountant.
 */
export class GoodsReceiptInvoices {
  private readonly clock: () => Date;

  constructor(private readonly deps: PartyFinanceDeps) {
    this.clock = deps.clock ?? (() => new Date());
  }

  async sync(
    workspaceId: string,
    goodsReceiptId: string,
  ): Promise<GoodsReceiptSyncOutcome> {
    const { db } = this.deps;
    return db.$transaction(async (tx) => {
      const grn =
        (
          await this.deps.directory.goodsReceipts(tx, workspaceId, [
            goodsReceiptId,
          ])
        ).get(goodsReceiptId) ?? null;
      const link = await this.deps.store.liveLinkOfGoodsReceipt(
        tx,
        goodsReceiptId,
      );
      const [invoice] =
        link == null
          ? []
          : await this.deps.store.lockInvoices(tx, workspaceId, [
              link.invoiceId,
            ]);
      const at = this.clock();
      if (link != null && invoice?.origin === "manual") {
        if (grn == null) {
          await this.deps.store.tombstoneLinks(tx, { id: link.id }, at);
          return "unlinked";
        }
        if (grn.totalValue !== link.grnValue)
          await this.deps.store.updateLinkValue(tx, link.id, grn.totalValue);
        return "unchanged";
      }
      if (grn?.invoiceNo == null) {
        if (invoice == null) return "skipped_no_invoice";
        if (await this.touched(tx, invoice)) return "skipped_paid";
        await this.removeOwn(
          tx,
          invoice,
          grn?.updatedBy ?? invoice.updatedBy,
          at,
        );
        return "deleted";
      }
      const amount = grn.invoiceAmount ?? grn.totalValue;
      if (amount <= 0n) return "skipped_zero";
      const invoiceDate = grn.invoiceDate ?? grn.receiptDate;
      const dueDate = dueDateFromTerms(invoiceDate, grn.paymentTermsDays);
      if (invoice == null)
        return this.create(tx, workspaceId, grn, {
          amount,
          invoiceDate,
          dueDate,
          at,
        });
      if (await this.touched(tx, invoice)) return "skipped_paid";
      if (
        invoice.partyId !== grn.supplierId ||
        invoice.place.kind !== grn.location.kind ||
        invoice.place.id !== grn.location.id
      ) {
        // The GRN moved to another Supplier or place: its invoice follows.
        await this.removeOwn(tx, invoice, grn.updatedBy, at);
        return this.create(tx, workspaceId, grn, {
          amount,
          invoiceDate,
          dueDate,
          at,
        });
      }
      return this.follow(tx, invoice, link?.id ?? null, grn, {
        amount,
        invoiceDate,
        dueDate,
        at,
      });
    });
  }

  /** Allocated, written off or with a settlement pending. */
  private async touched(tx: FinanceTx, invoice: StoredInvoice) {
    if (invoice.settledAt != null) return true;
    const figures = (
      await this.deps.store.invoiceFigures(tx, [invoice.id])
    ).get(invoice.id);
    if ((figures?.allocated ?? 0n) > 0n) return true;
    const settlements = await this.deps.store.settlementsOfInvoices(tx, [
      invoice.id,
    ]);
    return settlements.some((row) => row.approvalStatus === "pending");
  }

  private async create(
    tx: FinanceTx,
    workspaceId: string,
    grn: GoodsReceiptFacts,
    next: {
      amount: bigint;
      invoiceDate: string;
      dueDate: string | null;
      at: Date;
    },
  ): Promise<GoodsReceiptSyncOutcome> {
    const { store, ledgers } = this.deps;
    const { amount, invoiceDate, dueDate, at } = next;
    const party = { type: "supplier" as const, id: grn.supplierId };
    const number = grn.invoiceNo ?? "";
    if (await store.payableNumberTaken(tx, workspaceId, party, number, null))
      return "skipped_number_taken";
    const place: PartyPlace = { kind: grn.location.kind, id: grn.location.id };
    const row: StoredInvoice = {
      id: newId(),
      workspaceId,
      partyType: "supplier",
      partyId: grn.supplierId,
      place,
      direction: "payable",
      origin: "goods_receipt",
      sourceId: null,
      invoiceNumber: number,
      invoiceDate,
      dueDate,
      departmentId: null,
      taxableAmount: null,
      gstAmount: null,
      amount,
      remarks: null,
      settledAt: null,
      createdAt: at,
      updatedAt: at,
      createdBy: grn.updatedBy,
      updatedBy: grn.updatedBy,
    };
    await store.insertInvoice(tx, row);
    await store.insertLinks(tx, workspaceId, [
      { invoiceId: row.id, goodsReceiptId: grn.id, grnValue: grn.totalValue },
    ]);
    await ledgers.party.post(tx, workspaceId, grn.updatedBy, [
      invoiceEntry(row),
    ]);
    await recordAudit(tx, {
      workspaceId,
      actorUserId: grn.updatedBy,
      action: "invoice.created_from_goods_receipt",
      entityType: "invoice",
      entityId: row.id,
      after: auditable({
        goodsReceiptId: grn.id,
        invoiceNumber: number,
        invoiceDate,
        dueDate,
        amount,
      }),
      occurredAt: at,
    });
    return "created";
  }

  private async follow(
    tx: FinanceTx,
    invoice: StoredInvoice,
    linkId: string | null,
    grn: GoodsReceiptFacts,
    next: {
      amount: bigint;
      invoiceDate: string;
      dueDate: string | null;
      at: Date;
    },
  ): Promise<GoodsReceiptSyncOutcome> {
    const { store, ledgers } = this.deps;
    const number = grn.invoiceNo ?? invoice.invoiceNumber;
    const party = { type: "supplier" as const, id: invoice.partyId };
    if (
      number.toLowerCase() !== invoice.invoiceNumber.toLowerCase() &&
      (await store.payableNumberTaken(
        tx,
        invoice.workspaceId,
        party,
        number,
        invoice.id,
      ))
    )
      return "skipped_number_taken";
    if (linkId != null) await store.updateLinkValue(tx, linkId, grn.totalValue);
    const same =
      number === invoice.invoiceNumber &&
      next.amount === invoice.amount &&
      next.invoiceDate === invoice.invoiceDate &&
      next.dueDate === invoice.dueDate;
    if (same) return "unchanged";
    await store.updateInvoice(tx, invoice.id, {
      invoiceNumber: number,
      invoiceDate: next.invoiceDate,
      dueDate: next.dueDate,
      amount: next.amount,
      updatedAt: next.at,
      updatedBy: grn.updatedBy,
    });
    if (
      next.amount !== invoice.amount ||
      next.invoiceDate !== invoice.invoiceDate
    ) {
      await ledgers.party.reverseSource(
        tx,
        invoice.workspaceId,
        grn.updatedBy,
        "invoice",
        invoice.id,
      );
      await ledgers.party.post(tx, invoice.workspaceId, grn.updatedBy, [
        invoiceEntry({
          ...invoice,
          amount: next.amount,
          invoiceDate: next.invoiceDate,
        }),
      ]);
    }
    await recordAudit(tx, {
      workspaceId: invoice.workspaceId,
      actorUserId: grn.updatedBy,
      action: "invoice.updated_from_goods_receipt",
      entityType: "invoice",
      entityId: invoice.id,
      before: auditable({
        invoiceNumber: invoice.invoiceNumber,
        invoiceDate: invoice.invoiceDate,
        dueDate: invoice.dueDate,
        amount: invoice.amount,
      }),
      after: auditable({
        invoiceNumber: number,
        invoiceDate: next.invoiceDate,
        dueDate: next.dueDate,
        amount: next.amount,
      }),
      occurredAt: next.at,
    });
    return "updated";
  }

  private async removeOwn(
    tx: FinanceTx,
    invoice: StoredInvoice,
    by: string,
    at: Date,
  ): Promise<void> {
    await this.deps.ledgers.party.reverseSource(
      tx,
      invoice.workspaceId,
      by,
      "invoice",
      invoice.id,
    );
    await this.deps.store.tombstoneLinks(tx, { invoiceId: invoice.id }, at);
    await this.deps.store.tombstoneInvoice(tx, invoice.id, by, at);
    await recordAudit(tx, {
      workspaceId: invoice.workspaceId,
      actorUserId: by,
      action: "invoice.deleted_with_goods_receipt",
      entityType: "invoice",
      entityId: invoice.id,
      before: auditable({
        invoiceNumber: invoice.invoiceNumber,
        amount: invoice.amount,
      }),
      occurredAt: at,
    });
  }
}
