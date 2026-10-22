import type { MemberAccess } from "@/src/shared-kernel/access";
import { recordAudit } from "@/src/shared-kernel/audit";
import type { CalendarDate } from "@/src/shared-kernel/calendar-date";
import {
  conflict,
  DomainError,
  notFound,
} from "@/src/shared-kernel/domain-error";
import { newId } from "@/src/shared-kernel/ids";
import { nextSequenceNumber } from "@/src/shared-kernel/sequence/next-sequence-number";

import {
  assertAmountCovers,
  hasVariance,
  invoiceEntry,
  invoiceFields,
  invoiceProgress,
  type InvoiceDirection,
  type InvoiceProgress,
} from "../domain/invoice";
import type { PartyType } from "../domain/ledger";
import {
  assertPartyOnPlace,
  paiseFrom,
  placeFromInput,
  type PartyPlace,
} from "../domain/party";
import {
  assertOnPlace,
  assertPlaceExists,
  auditable,
  canOnPlace,
  loadParty,
  partyKey,
  partyNames,
  placeKey,
  placeNames,
} from "./party-common";
import type {
  FinanceTx,
  InvoiceListFilter,
  PageParams,
  PartyFinanceDeps,
  StoredInvoice,
  StoredSettlement,
} from "./party-ports";
import type { GoodsReceiptFacts } from "./ports";

export const invoiceNotFound = () =>
  notFound("INVOICE_NOT_FOUND", "This invoice was not found.");

export type InvoiceWriteInput = {
  invoiceNumber?: string | null;
  invoiceDate: string;
  dueDate?: string | null;
  departmentId?: string | null;
  /** Paise. */
  taxableAmount?: number | null;
  gstAmount?: number | null;
  /** Paise; on a new supplier invoice from GRNs it defaults to their total value. */
  amount?: number | null;
  remarks?: string | null;
};

export type CreateInvoiceInput = InvoiceWriteInput & {
  partyType: PartyType;
  partyId: string;
  projectId?: string | null;
  storeId?: string | null;
  direction?: InvoiceDirection;
  /** A Supplier's GRNs awaiting an invoice (CM-0017 §13). */
  goodsReceiptIds?: readonly string[] | null;
};

export type InvoiceActions = {
  edit: boolean;
  delete: boolean;
  settle: boolean;
  pay: boolean;
};

export type InvoiceView = StoredInvoice &
  InvoiceProgress & {
    partyName: string | null;
    placeName: string | null;
    departmentName: string | null;
    allocated: bigint;
    writtenOff: bigint;
    goodsReceipts: { id: string; number: string | null; grnValue: bigint }[];
    /** Σ linked GRN value; null without GRNs. */
    grnValue: bigint | null;
    variance: boolean;
    pendingSettlement: StoredSettlement | null;
    settlements: StoredSettlement[];
    payments: {
      paymentId: string;
      number: string;
      paymentDate: CalendarDate;
      amount: bigint;
    }[];
  };

export function invoiceActions(
  access: MemberAccess,
  view: Pick<
    InvoiceView,
    "place" | "allocated" | "status" | "pendingSettlement" | "balance"
  > & { origin?: InvoiceView["origin"] },
): InvoiceActions {
  const settled = view.status === "settled";
  // A Contractor Bill's invoice is changed by reversing the bill (CM-1106).
  const fromBill = view.origin === "ra_bill";
  return {
    edit: !settled && !fromBill && canOnPlace(access, "update", view.place),
    delete:
      !fromBill &&
      view.allocated === 0n &&
      !settled &&
      view.pendingSettlement == null &&
      canOnPlace(access, "delete", view.place),
    settle:
      !settled &&
      view.balance > 0n &&
      view.pendingSettlement == null &&
      canOnPlace(access, "create", view.place),
    pay:
      !settled && view.balance > 0n && canOnPlace(access, "create", view.place),
  };
}

/**
 * A Contractor Bill's invoice (origin `ra_bill`, CM-1106) is read-only in
 * finance: 409 `INVOICE_FROM_CONTRACTOR_BILL`. Reversing the bill removes
 * it; payments and settlements still work as on any invoice.
 */
function assertNotFromContractorBill(invoice: StoredInvoice): void {
  if (invoice.origin === "ra_bill")
    throw conflict(
      "INVOICE_FROM_CONTRACTOR_BILL",
      `This invoice comes from Contractor Bill ${invoice.invoiceNumber}. Reverse the bill in Contracts to change it.`,
    );
}

function snapshot(invoice: StoredInvoice) {
  return auditable({
    partyType: invoice.partyType,
    partyId: invoice.partyId,
    place: invoice.place,
    direction: invoice.direction,
    origin: invoice.origin,
    invoiceNumber: invoice.invoiceNumber,
    invoiceDate: invoice.invoiceDate,
    dueDate: invoice.dueDate,
    departmentId: invoice.departmentId,
    taxableAmount: invoice.taxableAmount,
    gstAmount: invoice.gstAmount,
    amount: invoice.amount,
    remarks: invoice.remarks,
  });
}

function optionalPaise(raw: number | null | undefined, field: string) {
  return raw == null ? null : paiseFrom(raw, field, { allowZero: true });
}

/**
 * Party invoices (CM-705, CM-706, CM-708; ADR CM-0017 §7, §11, §13): bills
 * from Contractors, Suppliers and Other Parties and sales invoices to
 * Other Parties. Each write is one transaction with its party entry, the
 * back-dated check (module `party_invoice`) and the audit event.
 */
export class InvoiceHandlers {
  private readonly clock: () => Date;

  constructor(private readonly deps: PartyFinanceDeps) {
    this.clock = deps.clock ?? (() => new Date());
  }

  async find(workspaceId: string, id: string): Promise<StoredInvoice> {
    const invoice = await this.deps.store.findInvoice(
      this.deps.db,
      workspaceId,
      id,
    );
    if (invoice == null) throw invoiceNotFound();
    return invoice;
  }

  private async checkDepartment(
    db: FinanceTx,
    workspaceId: string,
    departmentIds: readonly string[],
    departmentId: string | null,
  ): Promise<void> {
    if (departmentId == null) return;
    const found = await this.deps.directory.departments(db, workspaceId, [
      departmentId,
    ]);
    if (!found.has(departmentId) || !departmentIds.includes(departmentId))
      throw new DomainError(
        "DEPARTMENT_NOT_OF_CONTRACTOR",
        "Choose one of the Contractor's Departments.",
        { details: { field: "departmentId" } },
      );
  }

  /** GRNs a manual supplier invoice gathers: the Supplier's, at the place, not invoiced. */
  private async goodsReceiptsFor(
    tx: FinanceTx,
    workspaceId: string,
    supplierId: string,
    place: PartyPlace,
    ids: readonly string[],
  ): Promise<GoodsReceiptFacts[]> {
    const unique = [...new Set(ids)];
    const found = await this.deps.directory.goodsReceipts(
      tx,
      workspaceId,
      unique,
    );
    const rows: GoodsReceiptFacts[] = [];
    for (const [index, id] of unique.entries()) {
      const grn = found.get(id);
      if (
        grn?.supplierId !== supplierId ||
        grn.location.kind !== place.kind ||
        grn.location.id !== place.id
      )
        throw new DomainError(
          "GOODS_RECEIPT_NOT_FOUND",
          "A Goods Receipt was not found for this Supplier here.",
          { details: { field: `goodsReceiptIds.${String(index)}`, index } },
        );
      if ((await this.deps.store.liveLinkOfGoodsReceipt(tx, id)) != null)
        throw conflict(
          "GOODS_RECEIPT_INVOICED",
          `Goods Receipt ${grn.number} already has an invoice.`,
          { field: `goodsReceiptIds.${String(index)}`, index },
        );
      rows.push(grn);
    }
    return rows;
  }

  async create(
    access: MemberAccess,
    input: CreateInvoiceInput,
  ): Promise<string> {
    const { db, store } = this.deps;
    const workspaceId = access.workspaceId;
    const place = placeFromInput(input.partyType, input);
    assertOnPlace(access, "create", place);
    const direction = input.direction ?? "payable";
    const grnIds = input.goodsReceiptIds ?? [];
    if (grnIds.length > 0 && input.partyType !== "supplier")
      throw new DomainError(
        "GOODS_RECEIPTS_ONLY_FOR_SUPPLIERS",
        "Only a Supplier's invoice gathers Goods Receipts.",
        { details: { field: "goodsReceiptIds" } },
      );
    await assertPlaceExists(this.deps, db, workspaceId, place);
    const party = await loadParty(
      this.deps,
      db,
      workspaceId,
      input.partyType,
      input.partyId,
    );
    assertPartyOnPlace(party, place);
    const check = await this.deps.backdated(access);
    const id = newId();
    const at = this.clock();
    await db.$transaction(async (tx) => {
      const grns = await this.goodsReceiptsFor(
        tx,
        workspaceId,
        party.id,
        place,
        grnIds,
      );
      const amount =
        input.amount != null
          ? paiseFrom(input.amount, "amount")
          : grns.length > 0
            ? grns.reduce((sum, grn) => sum + grn.totalValue, 0n)
            : paiseFrom(0, "amount");
      const fields = invoiceFields(party.type, direction, {
        ...input,
        taxableAmount: optionalPaise(input.taxableAmount, "taxableAmount"),
        gstAmount: optionalPaise(input.gstAmount, "gstAmount"),
        amount,
      });
      await this.checkDepartment(
        tx,
        workspaceId,
        party.departmentIds,
        fields.departmentId,
      );
      check.check("party_invoice", "create", fields.invoiceDate);
      let invoiceNumber = fields.invoiceNumber;
      if (direction === "payable") {
        if (
          await store.payableNumberTaken(
            tx,
            workspaceId,
            party,
            invoiceNumber ?? "",
            null,
          )
        )
          throw numberTaken();
      } else {
        invoiceNumber = (
          await nextSequenceNumber(tx, {
            workspaceId,
            module: "other_party_sales_invoice",
            projectId: place.kind === "project" ? place.id : null,
            date: fields.invoiceDate,
            by: access.userId,
          })
        ).number;
      }
      const row: StoredInvoice = {
        id,
        workspaceId,
        partyType: party.type,
        partyId: party.id,
        place,
        direction,
        origin: "manual",
        sourceId: null,
        invoiceNumber: invoiceNumber ?? "",
        invoiceDate: fields.invoiceDate,
        dueDate: fields.dueDate,
        departmentId: fields.departmentId,
        taxableAmount: fields.taxableAmount,
        gstAmount: fields.gstAmount,
        amount: fields.amount,
        remarks: fields.remarks,
        settledAt: null,
        createdAt: at,
        updatedAt: at,
        createdBy: access.userId,
        updatedBy: access.userId,
      };
      await store.insertInvoice(tx, row);
      await store.insertLinks(
        tx,
        workspaceId,
        grns.map((grn) => ({
          invoiceId: id,
          goodsReceiptId: grn.id,
          grnValue: grn.totalValue,
        })),
      );
      await this.deps.ledgers.party.post(tx, workspaceId, access.userId, [
        invoiceEntry(row),
      ]);
      await recordAudit(tx, {
        workspaceId,
        actorUserId: access.userId,
        action: "invoice.created",
        entityType: "invoice",
        entityId: id,
        after: { ...snapshot(row), goodsReceiptIds: grns.map((g) => g.id) },
        occurredAt: at,
      });
    });
    return id;
  }

  /**
   * Edits an invoice. A change of amount or date reverses its party entry
   * and posts the new one; the amount cannot go below what is allocated
   * and written off (409 `INVOICE_BELOW_ALLOCATED`). A settled invoice is
   * not edited; a GRN's invoice takes its number, date and amount from the
   * GRN (change the GRN instead).
   */
  async update(
    access: MemberAccess,
    id: string,
    expectedUpdatedAt: Date,
    input: InvoiceWriteInput,
  ): Promise<void> {
    const { db, store } = this.deps;
    const workspaceId = access.workspaceId;
    const current = await this.find(workspaceId, id);
    assertOnPlace(access, "update", current.place);
    const party = await loadParty(
      this.deps,
      db,
      workspaceId,
      current.partyType,
      current.partyId,
    );
    const check = await this.deps.backdated(access);
    const at = this.clock();
    await db.$transaction(async (tx) => {
      const [locked] = await store.lockInvoices(tx, workspaceId, [id]);
      if (locked == null) throw invoiceNotFound();
      if (locked.updatedAt.getTime() !== expectedUpdatedAt.getTime())
        throw conflict(
          "INVOICE_CHANGED",
          "Someone changed this invoice. Reload it and try again.",
          { updatedAt: locked.updatedAt.toISOString() },
        );
      if (locked.settledAt != null)
        throw conflict("INVOICE_SETTLED", "A settled invoice is not edited.");
      assertNotFromContractorBill(locked);
      const fromGrn = locked.origin === "goods_receipt";
      const fields = invoiceFields(party.type, locked.direction, {
        ...input,
        invoiceNumber:
          locked.direction === "receivable" || fromGrn
            ? locked.invoiceNumber
            : input.invoiceNumber,
        invoiceDate: fromGrn ? locked.invoiceDate : input.invoiceDate,
        amount: fromGrn
          ? locked.amount
          : input.amount == null
            ? locked.amount
            : paiseFrom(input.amount, "amount"),
        taxableAmount: optionalPaise(input.taxableAmount, "taxableAmount"),
        gstAmount: optionalPaise(input.gstAmount, "gstAmount"),
      });
      if (
        fromGrn &&
        ((input.invoiceNumber != null &&
          input.invoiceNumber.trim() !== locked.invoiceNumber) ||
          input.invoiceDate !== locked.invoiceDate ||
          (input.amount != null && BigInt(input.amount) !== locked.amount))
      )
        throw new DomainError(
          "INVOICE_FROM_GOODS_RECEIPT",
          "This invoice's number, date and amount come from its Goods Receipt. Edit the Goods Receipt instead.",
          { details: { field: "invoiceNumber" } },
        );
      if (fields.departmentId !== locked.departmentId)
        await this.checkDepartment(
          tx,
          workspaceId,
          party.departmentIds,
          fields.departmentId,
        );
      check.check("party_invoice", "edit", locked.invoiceDate);
      if (fields.invoiceDate !== locked.invoiceDate)
        check.check("party_invoice", "edit", fields.invoiceDate);
      const invoiceNumber =
        locked.direction === "receivable"
          ? locked.invoiceNumber
          : (fields.invoiceNumber ?? locked.invoiceNumber);
      if (
        invoiceNumber.toLowerCase() !== locked.invoiceNumber.toLowerCase() &&
        (await store.payableNumberTaken(
          tx,
          workspaceId,
          party,
          invoiceNumber,
          id,
        ))
      )
        throw numberTaken();
      const moneyChanged =
        fields.amount !== locked.amount ||
        fields.invoiceDate !== locked.invoiceDate;
      if (fields.amount !== locked.amount) {
        const figures = (await store.invoiceFigures(tx, [id])).get(id);
        assertAmountCovers(
          fields.amount,
          figures ?? { allocated: 0n, writtenOff: 0n },
        );
      }
      const next: StoredInvoice = {
        ...locked,
        ...fields,
        invoiceNumber,
        updatedAt: at,
        updatedBy: access.userId,
      };
      await store.updateInvoice(tx, id, {
        invoiceNumber,
        invoiceDate: fields.invoiceDate,
        dueDate: fields.dueDate,
        departmentId: fields.departmentId,
        taxableAmount: fields.taxableAmount,
        gstAmount: fields.gstAmount,
        amount: fields.amount,
        remarks: fields.remarks,
        updatedAt: at,
        updatedBy: access.userId,
      });
      if (moneyChanged) {
        await this.deps.ledgers.party.reverseSource(
          tx,
          workspaceId,
          access.userId,
          "invoice",
          id,
        );
        await this.deps.ledgers.party.post(tx, workspaceId, access.userId, [
          invoiceEntry(next),
        ]);
      }
      await recordAudit(tx, {
        workspaceId,
        actorUserId: access.userId,
        action: "invoice.updated",
        entityType: "invoice",
        entityId: id,
        before: snapshot(locked),
        after: snapshot(next),
        occurredAt: at,
      });
    });
  }

  /**
   * Deletes an invoice nothing is allocated to, not settled and with no
   * settlement pending (409 `INVOICE_ALLOCATED` / `SETTLEMENT_PENDING`):
   * reverses its entry and frees its GRNs (they await an invoice again).
   */
  async delete(
    access: MemberAccess,
    id: string,
    expectedUpdatedAt: Date,
  ): Promise<void> {
    const { db, store } = this.deps;
    const workspaceId = access.workspaceId;
    const current = await this.find(workspaceId, id);
    assertOnPlace(access, "delete", current.place);
    const check = await this.deps.backdated(access);
    const at = this.clock();
    await db.$transaction(async (tx) => {
      const [locked] = await store.lockInvoices(tx, workspaceId, [id]);
      if (locked == null) throw invoiceNotFound();
      if (locked.updatedAt.getTime() !== expectedUpdatedAt.getTime())
        throw conflict(
          "INVOICE_CHANGED",
          "Someone changed this invoice. Reload it and try again.",
          { updatedAt: locked.updatedAt.toISOString() },
        );
      assertNotFromContractorBill(locked);
      await this.assertRemovable(tx, locked);
      check.check("party_invoice", "edit", locked.invoiceDate);
      await this.remove(tx, locked, access.userId, at);
      await recordAudit(tx, {
        workspaceId,
        actorUserId: access.userId,
        action: "invoice.deleted",
        entityType: "invoice",
        entityId: id,
        before: snapshot(locked),
        occurredAt: at,
      });
    });
  }

  /** Throws unless nothing is allocated, settled or pending on the invoice. */
  async assertRemovable(tx: FinanceTx, invoice: StoredInvoice): Promise<void> {
    const figures = (
      await this.deps.store.invoiceFigures(tx, [invoice.id])
    ).get(invoice.id);
    if (
      invoice.settledAt != null ||
      (figures?.allocated ?? 0n) > 0n ||
      (figures?.writtenOff ?? 0n) > 0n
    )
      throw conflict(
        "INVOICE_ALLOCATED",
        "Payments or a settlement already point at this invoice, so it cannot be deleted.",
      );
    const settlements = await this.deps.store.settlementsOfInvoices(tx, [
      invoice.id,
    ]);
    if (settlements.some((row) => row.approvalStatus === "pending"))
      throw conflict(
        "SETTLEMENT_PENDING",
        "A settlement of this invoice is waiting for approval.",
      );
  }

  /** Reverses the invoice's entry and tombstones it with its GRN links. */
  async remove(
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
  }

  /** Read models with figures, names, GRNs, settlements and payments. */
  async views(
    workspaceId: string,
    rows: readonly StoredInvoice[],
    db: FinanceTx = this.deps.db,
  ): Promise<InvoiceView[]> {
    if (rows.length === 0) return [];
    const { store, directory } = this.deps;
    const ids = rows.map((row) => row.id);
    const [today, figures, links, settlements, allocations, parties, places] =
      await Promise.all([
        this.deps.today(workspaceId),
        store.invoiceFigures(db, ids),
        store.linksOfInvoices(db, ids),
        store.settlementsOfInvoices(db, ids),
        store.allocationsOfInvoices(db, ids),
        partyNames(this.deps, db, workspaceId, rows),
        placeNames(
          this.deps,
          db,
          workspaceId,
          rows.map((row) => row.place),
        ),
      ]);
    const departmentIds = rows.flatMap((row) =>
      row.departmentId == null ? [] : [row.departmentId],
    );
    const [departments, grns, payments] = await Promise.all([
      directory.departments(db, workspaceId, departmentIds),
      directory.goodsReceipts(
        db,
        workspaceId,
        links.map((link) => link.goodsReceiptId),
      ),
      store.findPayments(
        db,
        workspaceId,
        allocations.map((allocation) => allocation.paymentId),
      ),
    ]);
    const paymentById = new Map(payments.map((row) => [row.id, row]));
    return rows.map((row) => {
      const figure = figures.get(row.id) ?? { allocated: 0n, writtenOff: 0n };
      const own = links.filter((link) => link.invoiceId === row.id);
      const ownSettlements = settlements.filter(
        (item) => item.invoiceId === row.id,
      );
      const grnValues = own.map((link) => link.grnValue);
      return {
        ...row,
        ...invoiceProgress({ ...row, ...figure }, today),
        allocated: figure.allocated,
        writtenOff: figure.writtenOff,
        partyName: parties.get(partyKey(row.partyType, row.partyId)) ?? null,
        placeName: places.get(placeKey(row.place)) ?? null,
        departmentName:
          row.departmentId == null
            ? null
            : (departments.get(row.departmentId)?.name ?? null),
        goodsReceipts: own.map((link) => ({
          id: link.goodsReceiptId,
          number: grns.get(link.goodsReceiptId)?.number ?? null,
          grnValue: link.grnValue,
        })),
        grnValue:
          own.length === 0
            ? null
            : grnValues.reduce((sum, value) => sum + value, 0n),
        variance: hasVariance(row.amount, grnValues),
        pendingSettlement:
          ownSettlements.find((item) => item.approvalStatus === "pending") ??
          null,
        settlements: ownSettlements,
        payments: allocations
          .filter((allocation) => allocation.invoiceId === row.id)
          .flatMap((allocation) => {
            const payment = paymentById.get(allocation.paymentId);
            return payment == null
              ? []
              : [
                  {
                    paymentId: payment.id,
                    number: payment.number,
                    paymentDate: payment.paymentDate,
                    amount: allocation.amount,
                  },
                ];
          }),
      };
    });
  }

  async get(workspaceId: string, id: string): Promise<InvoiceView> {
    const invoice = await this.find(workspaceId, id);
    const [view] = await this.views(workspaceId, [invoice]);
    if (view == null) throw invoiceNotFound();
    return view;
  }

  async list(
    filter: Omit<InvoiceListFilter, "today">,
    page: PageParams,
  ): Promise<{ items: InvoiceView[]; hasMore: boolean; total: number }> {
    const { db, store } = this.deps;
    const today = await this.deps.today(filter.workspaceId);
    const found = await store.listInvoiceIds(db, { ...filter, today }, page);
    const rows = await store.findInvoices(
      db,
      filter.workspaceId,
      found.items.map((item) => item.id),
    );
    const byId = new Map(rows.map((row) => [row.id, row]));
    const ordered = found.items.flatMap((item) => {
      const row = byId.get(item.id);
      return row == null ? [] : [row];
    });
    return {
      items: await this.views(filter.workspaceId, ordered),
      hasMore: found.hasMore,
      total: found.total,
    };
  }

  /** A party's invoices with a balance on a place, oldest due first (the allocation table). */
  async outstanding(
    workspaceId: string,
    party: { type: PartyType; id: string },
    place: PartyPlace,
    direction: InvoiceDirection,
  ): Promise<InvoiceView[]> {
    const rows = await this.deps.store.outstandingInvoices(
      this.deps.db,
      workspaceId,
      party,
      place,
      direction,
    );
    return this.views(workspaceId, rows);
  }

  /** GRNs at a place without a live supplier invoice (CM-0017 §13). */
  async awaitingGoodsReceipts(
    workspaceId: string,
    place: PartyPlace,
    supplierId: string | null,
  ): Promise<GoodsReceiptFacts[]> {
    return this.deps.directory.awaitingInvoiceGoodsReceipts(
      this.deps.db,
      workspaceId,
      place,
      supplierId,
    );
  }
}

function numberTaken(): DomainError {
  return conflict(
    "INVOICE_NUMBER_TAKEN",
    "This party already has an invoice with this number.",
    { field: "invoiceNumber" },
  );
}
