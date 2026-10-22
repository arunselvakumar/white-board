import { recordAudit } from "@/src/shared-kernel/audit";
import type { CalendarDate } from "@/src/shared-kernel/calendar-date";
import { conflict, notFound } from "@/src/shared-kernel/domain-error";
import { newId } from "@/src/shared-kernel/ids";

import { invoiceEntry, type InvoiceDirection } from "../domain/invoice";
import { auditable } from "./party-common";
import type { FinanceTx, PartyFinanceDeps, StoredInvoice } from "./party-ports";

/** Who an RA bill's invoice is with: the side decides the direction. */
export type RaBillParty = "contractor" | "client";

/** What contracts hands finance when an RA bill is approved. */
export type RaBillInvoiceInput = {
  workspaceId: string;
  by: string;
  /** A Contractor Bill's Contractor (payable) or a Client Bill's Client (receivable). */
  partyType: RaBillParty;
  partyId: string;
  projectId: string;
  /** Contractor Bills: the Work Order's Department. */
  departmentId: string | null;
  /** The bill's number: the invoice number. */
  number: string;
  date: CalendarDate;
  /** Paise: the bill's gross, before GST. */
  taxable: bigint;
  /** Paise of GST in `amount` (0 under reverse charge). */
  gst: bigint;
  /** Paise: the bill's net, what is owed now. */
  amount: bigint;
  /** The bill's id. */
  billId: string;
};

const SIDES: Record<
  RaBillParty,
  { direction: InvoiceDirection; noun: string; bill: string; event: string }
> = {
  contractor: {
    direction: "payable",
    noun: "Contractor",
    bill: "Contractor Bill",
    event: "contractor_bill",
  },
  client: {
    direction: "receivable",
    noun: "Client",
    bill: "Client Bill",
    event: "client_bill",
  },
};

/**
 * Invoices from RA bills (ADR CM-0023 §7): payable invoices from
 * Contractor Bills (CM-1106) and receivable invoices to the Client from
 * Client Bills (CM-1107). Contracts calls these inside its own transaction
 * (through `PartyInvoicing` in `src/composition`), so the bill and its
 * invoice commit or roll back together. The invoice:
 *
 * - is the party's invoice on the bill's Project, origin `ra_bill`,
 *   `source_id` = the bill, payable to a Contractor or receivable from a
 *   Client;
 * - is numbered with the bill's number, dated the bill date, names the
 *   Work Order's Department (Contractors), and has no due date;
 * - has taxable = the bill's gross, GST = the GST payable on it (one total
 *   until CM-1113 splits it; none under reverse charge), and amount = the
 *   bill's net (retention and recoveries already taken off, so the party
 *   ledger's balance is what is owed now);
 * - posts one entry to the party ledger, like any invoice: `invoice` +net
 *   from a Contractor, `sales_invoice` −net to a Client.
 *
 * Finance shows it read-only (`INVOICE_FROM_CONTRACTOR_BILL`,
 * `INVOICE_FROM_CLIENT_BILL`). Reversing the bill reverses that entry and
 * removes the invoice, refused while anything is paid or received,
 * written off or pending write-off.
 */
export class RaBillInvoices {
  private readonly clock: () => Date;

  constructor(private readonly deps: PartyFinanceDeps) {
    this.clock = deps.clock ?? (() => new Date());
  }

  /** Creates the invoice and its party entry; returns its id. */
  async create(tx: FinanceTx, input: RaBillInvoiceInput): Promise<string> {
    const { store, ledgers } = this.deps;
    const side = SIDES[input.partyType];
    const party = { type: input.partyType, id: input.partyId };
    if (
      await store.numberTaken(
        tx,
        input.workspaceId,
        party,
        side.direction,
        input.number,
        null,
      )
    )
      throw conflict(
        "BILL_INVOICE_NUMBER_TAKEN",
        input.partyType === "contractor"
          ? `The Contractor already has an invoice numbered ${input.number} in finance. Renumber that invoice, or give this Project's Contractor Bill rule a project token.`
          : `The Client already has an invoice numbered ${input.number} in finance. Give this Project's Client Bill rule a project token.`,
        { number: input.number },
      );
    const at = this.clock();
    const row: StoredInvoice = {
      id: newId(at.getTime()),
      workspaceId: input.workspaceId,
      partyType: input.partyType,
      partyId: input.partyId,
      place: { kind: "project", id: input.projectId },
      direction: side.direction,
      origin: "ra_bill",
      sourceId: input.billId,
      invoiceNumber: input.number,
      invoiceDate: input.date,
      dueDate: null,
      departmentId:
        input.partyType === "contractor" ? input.departmentId : null,
      taxableAmount: input.taxable,
      gstAmount: input.gst,
      amount: input.amount,
      remarks: null,
      settledAt: null,
      createdAt: at,
      updatedAt: at,
      createdBy: input.by,
      updatedBy: input.by,
    };
    await store.insertInvoice(tx, row);
    await ledgers.party.post(tx, input.workspaceId, input.by, [
      invoiceEntry(row),
    ]);
    await recordAudit(tx, {
      workspaceId: input.workspaceId,
      actorUserId: input.by,
      action: `invoice.created_from_${side.event}`,
      entityType: "invoice",
      entityId: row.id,
      after: auditable({
        billId: input.billId,
        partyType: input.partyType,
        direction: side.direction,
        invoiceNumber: input.number,
        invoiceDate: input.date,
        taxableAmount: input.taxable,
        gstAmount: input.gst,
        amount: input.amount,
      }),
      occurredAt: at,
    });
    return row.id;
  }

  /** Paid or received (any live allocation), written off, settled or a write-off pending. */
  async isSettled(
    tx: FinanceTx,
    workspaceId: string,
    invoiceId: string,
  ): Promise<boolean> {
    const invoice = await this.find(tx, workspaceId, invoiceId);
    if (invoice.settledAt != null) return true;
    const figures = (await this.deps.store.invoiceFigures(tx, [invoiceId])).get(
      invoiceId,
    );
    if ((figures?.allocated ?? 0n) > 0n || (figures?.writtenOff ?? 0n) > 0n)
      return true;
    const settlements = await this.deps.store.settlementsOfInvoices(tx, [
      invoiceId,
    ]);
    return settlements.some((row) => row.approvalStatus !== "rejected");
  }

  /** Reverses the invoice's party entry and removes the invoice. */
  async reverse(
    tx: FinanceTx,
    input: {
      workspaceId: string;
      by: string;
      invoiceId: string;
      reason: string;
    },
  ): Promise<void> {
    const invoice = await this.find(tx, input.workspaceId, input.invoiceId);
    const at = this.clock();
    await this.deps.ledgers.party.reverseSource(
      tx,
      input.workspaceId,
      input.by,
      "invoice",
      invoice.id,
    );
    await this.deps.store.tombstoneInvoice(tx, invoice.id, input.by, at);
    await recordAudit(tx, {
      workspaceId: input.workspaceId,
      actorUserId: input.by,
      action: `invoice.reversed_with_${invoice.partyType === "client" ? "client_bill" : "contractor_bill"}`,
      entityType: "invoice",
      entityId: invoice.id,
      before: auditable({
        billId: invoice.sourceId,
        invoiceNumber: invoice.invoiceNumber,
        amount: invoice.amount,
      }),
      after: { reason: input.reason },
      occurredAt: at,
    });
  }

  private async find(
    tx: FinanceTx,
    workspaceId: string,
    invoiceId: string,
  ): Promise<StoredInvoice> {
    const [invoice] = await this.deps.store.lockInvoices(tx, workspaceId, [
      invoiceId,
    ]);
    if (invoice?.origin !== "ra_bill")
      throw notFound("INVOICE_NOT_FOUND", "This invoice was not found.");
    return invoice;
  }
}
