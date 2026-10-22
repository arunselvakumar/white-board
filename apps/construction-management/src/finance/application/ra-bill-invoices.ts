import { recordAudit } from "@/src/shared-kernel/audit";
import type { CalendarDate } from "@/src/shared-kernel/calendar-date";
import { conflict, notFound } from "@/src/shared-kernel/domain-error";
import { newId } from "@/src/shared-kernel/ids";

import {
  invoiceEntry,
  isContractsOrigin,
  type InvoiceDirection,
} from "../domain/invoice";
import { settledAmount } from "../domain/party-payment";
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

/** What contracts hands finance when retention is released (CM-1108). */
export type RetentionReleaseInvoiceInput = {
  workspaceId: string;
  by: string;
  /** A Work Order's Contractor (payable) or the client contract's Client (receivable). */
  partyType: RaBillParty;
  partyId: string;
  projectId: string;
  /** Contractor side: the Work Order's Department. */
  departmentId: string | null;
  /** The invoice number wanted; a taken one gets "-2", "-3", … */
  number: string;
  date: CalendarDate;
  /** Paise released. */
  amount: bigint;
  /** The release's id. */
  releaseId: string;
  /** "Retention released on WO/… (on completion)". */
  remarks: string;
};

/** One advance's recovery on a bill: that much of its payment settles the bill's invoice. */
export type AdvanceRecoveryAllocation = { paymentId: string; amount: bigint };

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
 *   bill's net **plus the advances it recovers** (CM-1108): retention is
 *   taken off, and a recovery is the advance being applied to the bill, so
 *   approval allocates that much of the advance's on-account payment to
 *   the invoice (`applyRecoveries`) and its balance is the net;
 * - posts one entry to the party ledger, like any invoice: `invoice`
 *   +amount from a Contractor, `sales_invoice` −amount to a Client.
 *
 * Finance shows it read-only (`INVOICE_FROM_CONTRACTOR_BILL`,
 * `INVOICE_FROM_CLIENT_BILL`). Reversing the bill takes the recoveries'
 * allocations back, reverses that entry and removes the invoice, refused
 * while anything else is paid or received, written off or pending
 * write-off. Retention releases (CM-1108) create and remove their
 * invoices here too (`createRelease`, origin `retention_release`).
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

  /**
   * Paid or received (any live allocation), written off, settled or a
   * write-off pending. Allocations from `own` (the bill's own advance
   * recoveries, CM-1108) do not count, up to their amounts.
   */
  async isSettled(
    tx: FinanceTx,
    workspaceId: string,
    invoiceId: string,
    own: readonly AdvanceRecoveryAllocation[] = [],
  ): Promise<boolean> {
    const invoice = await this.find(tx, workspaceId, invoiceId);
    if (invoice.settledAt != null) return true;
    const figures = (await this.deps.store.invoiceFigures(tx, [invoiceId])).get(
      invoiceId,
    );
    if ((figures?.writtenOff ?? 0n) > 0n) return true;
    if ((figures?.allocated ?? 0n) > 0n) {
      const left = new Map<string, bigint>();
      for (const row of own)
        left.set(row.paymentId, (left.get(row.paymentId) ?? 0n) + row.amount);
      const allocations = await this.deps.store.allocationsOfInvoices(tx, [
        invoiceId,
      ]);
      let others = 0n;
      for (const allocation of allocations) {
        const mine = left.get(allocation.paymentId) ?? 0n;
        const covered = allocation.amount < mine ? allocation.amount : mine;
        left.set(allocation.paymentId, mine - covered);
        others += allocation.amount - covered;
      }
      if (others > 0n) return true;
    }
    const settlements = await this.deps.store.settlementsOfInvoices(tx, [
      invoiceId,
    ]);
    return settlements.some((row) => row.approvalStatus !== "rejected");
  }

  /**
   * Creates the invoice for released retention (CM-1108, CM-0023 §8):
   * origin `retention_release`, `source_id` = the release, payable to the
   * Contractor or receivable from the Client on the Project, dated the
   * release, no due date, **no taxable value or GST** (GST was charged on
   * the bills that held it), amount = what is released. Its one party
   * entry is `invoice` +amount (Contractor) or `sales_invoice` −amount
   * (Client), so the party's balance shows it owed. Read-only in finance
   * (409 `INVOICE_FROM_RETENTION_RELEASE`). Returns its id and number.
   */
  async createRelease(
    tx: FinanceTx,
    input: RetentionReleaseInvoiceInput,
  ): Promise<{ id: string; number: string }> {
    const { store, ledgers } = this.deps;
    const side = SIDES[input.partyType];
    const party = { type: input.partyType, id: input.partyId };
    let number = input.number;
    for (let attempt = 2; ; attempt += 1) {
      if (
        !(await store.numberTaken(
          tx,
          input.workspaceId,
          party,
          side.direction,
          number,
          null,
        ))
      )
        break;
      if (attempt > 50)
        throw conflict(
          "RELEASE_INVOICE_NUMBER_TAKEN",
          `The ${side.noun} already has invoices numbered ${input.number}. Renumber them in finance.`,
          { number: input.number },
        );
      number = `${input.number}-${String(attempt)}`;
    }
    const at = this.clock();
    const row: StoredInvoice = {
      id: newId(at.getTime()),
      workspaceId: input.workspaceId,
      partyType: input.partyType,
      partyId: input.partyId,
      place: { kind: "project", id: input.projectId },
      direction: side.direction,
      origin: "retention_release",
      sourceId: input.releaseId,
      invoiceNumber: number,
      invoiceDate: input.date,
      dueDate: null,
      departmentId:
        input.partyType === "contractor" ? input.departmentId : null,
      taxableAmount: null,
      gstAmount: null,
      amount: input.amount,
      remarks: input.remarks,
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
      action: "invoice.created_from_retention_release",
      entityType: "invoice",
      entityId: row.id,
      after: auditable({
        releaseId: input.releaseId,
        partyType: input.partyType,
        direction: side.direction,
        invoiceNumber: number,
        invoiceDate: input.date,
        amount: input.amount,
      }),
      occurredAt: at,
    });
    return { id: row.id, number };
  }

  /**
   * Applies advances recovered on a bill (CM-1108): allocates `amount` of
   * each advance's on-account payment (or receipt) to the bill's invoice,
   * the way **Apply advance** does (CM-0017 §7), so no money moves; the
   * party's balance is unchanged and the invoice is partly settled. 409
   * `ADVANCE_ON_ACCOUNT_SHORT` when a payment has less left on account (it
   * was applied elsewhere in finance).
   */
  async applyRecoveries(
    tx: FinanceTx,
    input: {
      workspaceId: string;
      by: string;
      invoiceId: string;
      recoveries: readonly AdvanceRecoveryAllocation[];
    },
  ): Promise<void> {
    const recoveries = input.recoveries.filter((row) => row.amount > 0n);
    if (recoveries.length === 0) return;
    const { store } = this.deps;
    const invoice = await this.find(tx, input.workspaceId, input.invoiceId);
    const at = this.clock();
    for (const recovery of recoveries) {
      const payment = await store.lockPayment(
        tx,
        input.workspaceId,
        recovery.paymentId,
      );
      if (
        payment?.partyType !== invoice.partyType ||
        payment.partyId !== invoice.partyId ||
        payment.place.kind !== "project" ||
        invoice.place.kind !== "project" ||
        payment.place.id !== invoice.place.id ||
        payment.direction !== (invoice.direction === "payable" ? "out" : "in")
      )
        throw conflict(
          "ADVANCE_PAYMENT_NOT_FOUND",
          "The advance's payment is no longer in finance.",
          { paymentId: recovery.paymentId },
        );
      const allocated = (
        await store.allocationsOfPayments(tx, [payment.id])
      ).reduce((sum, row) => sum + row.amount, 0n);
      const left = settledAmount(payment) - allocated;
      if (left < recovery.amount)
        throw conflict(
          "ADVANCE_ON_ACCOUNT_SHORT",
          `Payment ${payment.number} has ₹${(Number(left < 0n ? 0n : left) / 100).toFixed(2)} left on account, less than this bill recovers. It was applied to other invoices in finance.`,
          { paymentId: payment.id, left: Number(left) },
        );
      await store.insertAllocations(
        tx,
        input.workspaceId,
        input.by,
        payment.id,
        [{ invoiceId: invoice.id, amount: recovery.amount }],
      );
      await store.touchPayment(tx, payment.id, input.by, at);
      await recordAudit(tx, {
        workspaceId: input.workspaceId,
        actorUserId: input.by,
        action: "party_payment.advance_recovered",
        entityType: "party_payment",
        entityId: payment.id,
        after: auditable({
          invoiceId: invoice.id,
          invoiceNumber: invoice.invoiceNumber,
          amount: recovery.amount,
        }),
        occurredAt: at,
      });
    }
  }

  /** Takes back what `applyRecoveries` allocated to the invoice (a reversed bill). */
  async undoRecoveries(
    tx: FinanceTx,
    input: {
      workspaceId: string;
      by: string;
      invoiceId: string;
      paymentIds: readonly string[];
    },
  ): Promise<void> {
    const { store } = this.deps;
    const at = this.clock();
    for (const paymentId of new Set(input.paymentIds)) {
      const payment = await store.lockPayment(tx, input.workspaceId, paymentId);
      if (payment == null) continue;
      await store.tombstoneAllocationsTo(
        tx,
        paymentId,
        input.invoiceId,
        input.by,
        at,
      );
      await store.touchPayment(tx, paymentId, input.by, at);
      await recordAudit(tx, {
        workspaceId: input.workspaceId,
        actorUserId: input.by,
        action: "party_payment.advance_recovery_reversed",
        entityType: "party_payment",
        entityId: paymentId,
        after: { invoiceId: input.invoiceId },
        occurredAt: at,
      });
    }
  }

  /**
   * Number, amount, what is paid or received and whether anything settles
   * them, for Contracts' screens (CM-1108). Reads only; live invoices.
   */
  async states(
    db: FinanceTx,
    workspaceId: string,
    invoiceIds: readonly string[],
  ): Promise<
    Map<
      string,
      {
        number: string;
        amount: bigint;
        allocated: bigint;
        balance: bigint;
        settled: boolean;
      }
    >
  > {
    const ids = [...new Set(invoiceIds)];
    if (ids.length === 0) return new Map();
    const { store } = this.deps;
    const [invoices, figures, settlements] = await Promise.all([
      store.findInvoices(db, workspaceId, ids),
      store.invoiceFigures(db, ids),
      store.settlementsOfInvoices(db, ids),
    ]);
    return new Map(
      invoices.map((invoice) => {
        const figure = figures.get(invoice.id) ?? {
          allocated: 0n,
          writtenOff: 0n,
        };
        const pending = settlements.some(
          (row) =>
            row.invoiceId === invoice.id && row.approvalStatus !== "rejected",
        );
        return [
          invoice.id,
          {
            number: invoice.invoiceNumber,
            amount: invoice.amount,
            allocated: figure.allocated,
            balance: invoice.amount - figure.allocated - figure.writtenOff,
            settled:
              invoice.settledAt != null ||
              figure.allocated > 0n ||
              figure.writtenOff > 0n ||
              pending,
          },
        ];
      }),
    );
  }

  /** Payment numbers by id (CM-1108: an advance's payment). */
  async paymentNumbers(
    db: FinanceTx,
    workspaceId: string,
    paymentIds: readonly string[],
  ): Promise<Map<string, string>> {
    const rows = await this.deps.store.findPayments(db, workspaceId, [
      ...new Set(paymentIds),
    ]);
    return new Map(rows.map((row) => [row.id, row.number]));
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
      action:
        invoice.origin === "retention_release"
          ? "invoice.removed_with_retention_release"
          : `invoice.reversed_with_${invoice.partyType === "client" ? "client_bill" : "contractor_bill"}`,
      entityType: "invoice",
      entityId: invoice.id,
      before: auditable({
        sourceId: invoice.sourceId,
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
    if (invoice == null || !isContractsOrigin(invoice.origin))
      throw notFound("INVOICE_NOT_FOUND", "This invoice was not found.");
    return invoice;
  }
}
