import type { Prisma } from "@repo/construction-db";

import { recordAudit } from "@/src/shared-kernel/audit";
import type { CalendarDate } from "@/src/shared-kernel/calendar-date";
import {
  conflict,
  DomainError,
  notFound,
} from "@/src/shared-kernel/domain-error";
import type { DomainEvent, EventDispatcher } from "@/src/shared-kernel/events";
import {
  defaultSupplyType,
  type LineAmounts,
  type SupplyType,
} from "@/src/shared-kernel/gst-line";
import { newId } from "@/src/shared-kernel/ids";
import type { ListCursor } from "@/src/shared-kernel/list-cursor";
import { nextSequenceNumber } from "@/src/shared-kernel/sequence/next-sequence-number";

import { PROCUREMENT_DOCUMENTS } from "../domain/documents";
import type { GoodsReceiptPosted } from "../domain/events";
import {
  assertReceiptDates,
  GOODS_RECEIPT_LIMITS,
  goodsReceiptDetails,
  netUnitRate,
  receiptLineAmounts,
  receiptTotals,
  receivedQuantity,
  type GoodsReceiptDetails,
  type RawGoodsReceiptDetails,
  type ReceiptStatus,
  type ReceiptTotals,
} from "../domain/goods-receipt";
import type { StockPosting, StockSource } from "../domain/stock-ledger";
import type { StockLocation } from "../domain/stock-location";
import type {
  GoodsReceiptPayments,
  MaterialFacts,
  ProcurementDirectory,
  SupplierFacts,
} from "./ports";

type Db = Prisma.TransactionClient;

export type GoodsReceiptActor = {
  workspaceId: string;
  userId: string;
  role: "owner" | "member";
};

export type StoredGoodsReceiptLine = {
  id: string;
  purchaseOrderItemId: string | null;
  position: number;
  materialId: string;
  materialName: string;
  uomId: string;
  uomName: string;
  hsnCode: string | null;
  /** Decimal string, `12.500`. */
  receivedQty: string;
  /** Paise per unit. */
  unitRate: bigint;
  /** Percent, `18.00`. */
  gstRate: string;
  amounts: Pick<LineAmounts, "taxable" | "cgst" | "sgst" | "igst" | "total">;
};

/** A GRN as stored (live). */
export type StoredGoodsReceipt = {
  id: string;
  workspaceId: string;
  location: StockLocation;
  number: string;
  receiptDate: CalendarDate;
  inventoryDate: CalendarDate;
  supplierId: string;
  supplierName: string;
  purchaseOrderId: string | null;
  supplyType: SupplyType;
  details: GoodsReceiptDetails;
  totals: ReceiptTotals;
  lines: StoredGoodsReceiptLine[];
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
  updatedBy: string;
};

/** A Purchase Order as a GRN reads it (the PO tables, CM-504). */
export type OrderFacts = {
  id: string;
  number: string;
  orderDate: CalendarDate;
  location: StockLocation;
  supplierId: string;
  supplierName: string;
  supplyType: SupplyType;
  approvalStatus: "pending" | "approved" | "rejected";
  receiptStatus: ReceiptStatus;
  closed: boolean;
  lines: OrderLineFacts[];
};

export type OrderLineFacts = {
  id: string;
  position: number;
  materialId: string;
  materialName: string;
  uomId: string;
  uomName: string;
  hsnCode: string | null;
  /** Ordered, decimal string. */
  quantity: string;
  unitRate: bigint;
  taxable: bigint;
  gstRate: string;
  /** Σ live GRN lines, decimal string. */
  receivedQty: string;
};

/** A Project or Store a GRN goes to. */
export type ReceiptLocationFacts = {
  location: StockLocation;
  name: string;
  stateCode: string | null;
  /** A Store's Suppliers; null for a Project (Suppliers carry their Projects). */
  storeSupplierIds: ReadonlySet<string> | null;
};

export type SupplierOption = {
  id: string;
  name: string;
  gstin: string | null;
  stateCode: string | null;
};

export type GoodsReceiptListParams = {
  workspaceId: string;
  location: StockLocation;
  /** Without View All: only GRNs this User created. */
  createdBy?: string;
  from?: CalendarDate;
  to?: CalendarDate;
  supplierId?: string;
  purchaseOrderId?: string;
  /** true: only GRNs against a PO; false: only GRNs without one. */
  withPurchaseOrder?: boolean;
  /** Number, invoice no, delivery challan no or GRN/DC no contains. */
  search?: string;
  limit: number;
  after?: ListCursor;
  before?: ListCursor;
};

export type GoodsReceiptListRow = {
  id: string;
  number: string;
  receiptDate: CalendarDate;
  inventoryDate: CalendarDate;
  supplierId: string;
  supplierName: string;
  purchaseOrder: { id: string; number: string } | null;
  invoiceNo: string | null;
  deliveryChallanNo: string | null;
  totalValue: bigint;
  lineCount: number;
  createdAt: Date;
};

export type GoodsReceiptListPage = {
  items: GoodsReceiptListRow[];
  total: number;
  hasMore: boolean;
  /** Suppliers of the GRNs the viewer may see at the location, for the filter. */
  suppliers: { id: string; name: string }[];
};

/**
 * Where GRNs live (Prisma in infrastructure). Write methods run inside the
 * caller's transaction; `transaction` opens one.
 */
export type GoodsReceiptStore = {
  transaction<T>(work: (tx: Db) => Promise<T>): Promise<T>;
  /** A live GRN; `lock` takes its row `FOR UPDATE` (inside a transaction). */
  find(
    db: Db,
    workspaceId: string,
    id: string,
    options?: { lock?: boolean },
  ): Promise<StoredGoodsReceipt | null>;
  location(
    db: Db,
    workspaceId: string,
    location: StockLocation,
  ): Promise<ReceiptLocationFacts | null>;
  /** Active Suppliers on the Project or Store, by name. */
  suppliersAt(
    db: Db,
    workspaceId: string,
    location: ReceiptLocationFacts,
  ): Promise<SupplierOption[]>;
  /**
   * A live PO with its lines; `lock` takes its row `FOR UPDATE`, so GRNs
   * against one PO (and its Close) serialise. `receivedQty` leaves out
   * the lines of `excludeReceiptId` (the GRN being edited).
   */
  order(
    db: Db,
    workspaceId: string,
    id: string,
    options?: { lock?: boolean; excludeReceiptId?: string },
  ): Promise<OrderFacts | null>;
  /** POs a GRN at the location can receive against (CM-0015 §9), plus `includeId`. */
  receivableOrders(
    db: Db,
    workspaceId: string,
    location: StockLocation,
    options: { includeId?: string | null; excludeReceiptId?: string },
  ): Promise<OrderFacts[]>;
  insert(tx: Db, receipt: StoredGoodsReceipt): Promise<void>;
  /** Rewrites the header and lines (lines keep their ids where kept). */
  replace(tx: Db, receipt: StoredGoodsReceipt): Promise<void>;
  tombstone(
    tx: Db,
    receipt: StoredGoodsReceipt,
    by: string,
    now: Date,
  ): Promise<void>;
  /**
   * The one place a PO's receipt follows its GRNs: `received_qty` of each
   * line = Σ live GRN lines, then `receipt_status` (not / partially /
   * received).
   */
  recomputeOrderReceipt(tx: Db, purchaseOrderId: string): Promise<void>;
  list(params: GoodsReceiptListParams): Promise<GoodsReceiptListPage>;
  /** Team Member names by User id, for "Received by". */
  userNames(
    db: Db,
    workspaceId: string,
    userIds: readonly string[],
  ): Promise<Map<string, string>>;
  companyName(db: Db, workspaceId: string): Promise<string>;
};

/** The stock ledger as a GRN uses it (`stockLedger()` in infrastructure). */
export type GoodsReceiptLedger = {
  post(
    tx: Db,
    context: { workspaceId: string; by: string },
    postings: readonly StockPosting[],
    options?: { materialNames?: ReadonlyMap<string, string> },
  ): Promise<{ events: DomainEvent[] }>;
  replaceSource(
    tx: Db,
    context: { workspaceId: string; by: string },
    source: StockSource,
    postings: readonly StockPosting[],
    options?: { materialNames?: ReadonlyMap<string, string> },
  ): Promise<{ events: DomainEvent[] }>;
  reverseSource(
    tx: Db,
    context: { workspaceId: string; by: string },
    source: StockSource,
    options?: { materialNames?: ReadonlyMap<string, string> },
  ): Promise<{ events: DomainEvent[] }>;
};

/** Checks entry dates against the Back-dated Entry policy for the actor. */
export type GoodsReceiptBackdated = (
  actor: GoodsReceiptActor,
) => Promise<
  (module: "goods_receipt", action: "create" | "edit", date: string) => void
>;

export type GoodsReceiptDeps = {
  store: GoodsReceiptStore;
  directory: ProcurementDirectory;
  ledger: GoodsReceiptLedger;
  payments: GoodsReceiptPayments;
  backdated: GoodsReceiptBackdated;
  today: (workspaceId: string) => Promise<CalendarDate>;
  dispatcher: EventDispatcher;
  /** A plain (non-transaction) client for reads. */
  db: Db;
};

export type GoodsReceiptLineInput = {
  /** The stored line this one keeps (edit); its rate stays without Financial. */
  id?: string | null;
  /** A line of the linked PO. */
  purchaseOrderItemId?: string | null;
  /** A Material, on a GRN without a PO. */
  materialId?: string | null;
  /** Decimal string, > 0, at most three decimals. */
  quantity: string;
  /** Paise per unit; ignored without Financial. */
  unitRate?: number | null;
  /** Percent; ignored without Financial. */
  gstRate?: string | null;
  /** 4–8 digits; defaults from the PO line or the Material. */
  hsnCode?: string | null;
};

type ReceiptFields = {
  actor: GoodsReceiptActor;
  /** Financial on Material Received: rates, amounts and invoice amount. */
  financial: boolean;
  receiptDate: CalendarDate;
  inventoryDate: CalendarDate;
  supplierId: string;
  purchaseOrderId?: string | null;
  /** Defaults from the PO, else the supplier and location states. */
  supplyType?: SupplyType | null;
  details: RawGoodsReceiptDetails;
  lines: readonly GoodsReceiptLineInput[];
};

export type PostGoodsReceiptInput = ReceiptFields & {
  location: StockLocation;
};

export type EditGoodsReceiptInput = ReceiptFields & {
  id: string;
  expectedUpdatedAt: Date;
};

export type DeleteGoodsReceiptInput = {
  actor: GoodsReceiptActor;
  id: string;
  expectedUpdatedAt: Date;
};

/** A GRN line with what its PO line ordered and received elsewhere. */
export type GoodsReceiptLineView = StoredGoodsReceiptLine & {
  /** The PO line's quantity; null without a PO line. */
  orderedQty: string | null;
  /** Received on other live GRNs against the PO line. */
  receivedElsewhereQty: string | null;
};

export type GoodsReceiptView = Omit<StoredGoodsReceipt, "lines"> & {
  locationName: string | null;
  purchaseOrder: { id: string; number: string } | null;
  lines: GoodsReceiptLineView[];
  createdByName: string | null;
  hiddenFields: ReadonlySet<string>;
  /** A supplier payment points at it (M7): no edit, no delete. */
  paid: boolean;
};

export type GoodsReceiptFormOptions = {
  location: ReceiptLocationFacts;
  suppliers: SupplierOption[];
  purchaseOrders: OrderFacts[];
  hiddenFields: ReadonlySet<string>;
};

const NAMING = PROCUREMENT_DOCUMENTS.goods_receipt.naming;

export const goodsReceiptNotFound = () =>
  notFound(`${NAMING.code}_NOT_FOUND`, `This ${NAMING.label} was not found.`);

const HSN_RE = /^\d{4,8}$/;

function lineError(error: unknown, index: number): unknown {
  if (!(error instanceof DomainError)) return error;
  const details =
    typeof error.details === "object" && error.details != null
      ? error.details
      : {};
  return new DomainError(error.code, error.message, {
    kind: error.kind,
    details: { ...details, index },
  });
}

function hsnCode(raw: string | null): string | null {
  const text = raw?.trim() ?? "";
  if (text === "") return null;
  if (!HSN_RE.test(text))
    throw new DomainError("HSN_INVALID", "An HSN code has 4 to 8 digits.", {
      details: { field: "hsnCode" },
    });
  return text;
}

function paise(raw: number): bigint {
  if (!Number.isSafeInteger(raw) || raw < 0)
    throw new DomainError(
      "UNIT_RATE_INVALID",
      "Enter a rate in rupees, 0 or more.",
      { details: { field: "unitRate" } },
    );
  return BigInt(raw);
}

/** What the audit log keeps of a GRN (bigints as numbers). */
function snapshot(receipt: StoredGoodsReceipt) {
  return {
    number: receipt.number,
    location: receipt.location,
    receiptDate: receipt.receiptDate,
    inventoryDate: receipt.inventoryDate,
    supplierId: receipt.supplierId,
    purchaseOrderId: receipt.purchaseOrderId,
    supplyType: receipt.supplyType,
    details: {
      ...receipt.details,
      invoiceAmount:
        receipt.details.invoiceAmount == null
          ? null
          : Number(receipt.details.invoiceAmount),
    },
    totalValue: Number(receipt.totals.totalValue),
    lines: receipt.lines.map((line) => ({
      id: line.id,
      purchaseOrderItemId: line.purchaseOrderItemId,
      materialId: line.materialId,
      receivedQty: line.receivedQty,
      unitRate: Number(line.unitRate),
      gstRate: line.gstRate,
      total: Number(line.amounts.total),
    })),
  };
}

function postings(receipt: StoredGoodsReceipt): StockPosting[] {
  return receipt.lines.map((line) => ({
    location: receipt.location,
    materialId: line.materialId,
    entryDate: receipt.inventoryDate,
    type: "received",
    quantity: line.receivedQty,
    unitRate: line.unitRate,
    source: { type: "goods_receipt", id: receipt.id },
    sourceLineId: line.id,
    counterpartyLabel: receipt.supplierName,
    remark: receipt.number,
  }));
}

function materialNames(
  ...receipts: (StoredGoodsReceipt | null)[]
): Map<string, string> {
  const names = new Map<string, string>();
  for (const receipt of receipts)
    for (const line of receipt?.lines ?? [])
      names.set(line.materialId, line.materialName);
  return names;
}

function posted(
  receipt: StoredGoodsReceipt,
  change: GoodsReceiptPosted["change"],
  at: Date,
): GoodsReceiptPosted {
  return {
    type: "procurement.goods_receipt_posted",
    workspaceId: receipt.workspaceId,
    occurredAt: at,
    goodsReceiptId: receipt.id,
    change,
    supplierId: receipt.supplierId,
    locationKind: receipt.location.kind,
    locationId: receipt.location.id,
    inventoryDate: receipt.inventoryDate,
    totalValue: change === "deleted" ? 0n : receipt.totals.totalValue,
  };
}

type BuiltReceipt = Pick<
  StoredGoodsReceipt,
  | "supplierId"
  | "supplierName"
  | "purchaseOrderId"
  | "supplyType"
  | "details"
  | "totals"
  | "lines"
>;

/**
 * Goods Receipts (CM-505, ADR CM-0015 §9): post, edit and delete, each in
 * one transaction with its stock ledger entries, the linked PO's receipt
 * and the audit event; `GoodsReceiptPosted` after commit.
 */
export class GoodsReceiptHandlers {
  constructor(private readonly deps: GoodsReceiptDeps) {}

  async get(workspaceId: string, id: string): Promise<StoredGoodsReceipt> {
    const receipt = await this.deps.store.find(this.deps.db, workspaceId, id);
    if (receipt == null) throw goodsReceiptNotFound();
    return receipt;
  }

  /** The GRN with its PO's ordered and other-received quantities. */
  async view(receipt: StoredGoodsReceipt): Promise<GoodsReceiptView> {
    const { db, store, directory, payments } = this.deps;
    const ws = receipt.workspaceId;
    const [location, order, names, hiddenFields, paid] = await Promise.all([
      store.location(db, ws, receipt.location),
      receipt.purchaseOrderId == null
        ? Promise.resolve(null)
        : store.order(db, ws, receipt.purchaseOrderId, {
            excludeReceiptId: receipt.id,
          }),
      store.userNames(db, ws, [receipt.createdBy]),
      directory.hiddenGrnFields(db, ws),
      payments.isPaid(db, ws, receipt.id),
    ]);
    const orderLines = new Map(order?.lines.map((line) => [line.id, line]));
    return {
      ...receipt,
      locationName: location?.name ?? null,
      purchaseOrder:
        order == null ? null : { id: order.id, number: order.number },
      lines: receipt.lines.map((line) => {
        const orderLine =
          line.purchaseOrderItemId == null
            ? undefined
            : orderLines.get(line.purchaseOrderItemId);
        return {
          ...line,
          orderedQty: orderLine?.quantity ?? null,
          receivedElsewhereQty: orderLine?.receivedQty ?? null,
        };
      }),
      createdByName: names.get(receipt.createdBy) ?? null,
      hiddenFields,
      paid,
    };
  }

  list(params: GoodsReceiptListParams): Promise<GoodsReceiptListPage> {
    return this.deps.store.list(params);
  }

  /** Suppliers, receivable POs and hidden fields for the GRN form. */
  async formOptions(
    workspaceId: string,
    location: StockLocation,
    options: { goodsReceiptId?: string } = {},
  ): Promise<GoodsReceiptFormOptions> {
    const { db, store, directory } = this.deps;
    const facts = await this.locationFacts(db, workspaceId, location);
    const receipt =
      options.goodsReceiptId == null
        ? null
        : await store.find(db, workspaceId, options.goodsReceiptId);
    if (
      receipt != null &&
      (receipt.location.kind !== location.kind ||
        receipt.location.id !== location.id)
    )
      throw goodsReceiptNotFound();
    const [suppliers, purchaseOrders, hiddenFields] = await Promise.all([
      store.suppliersAt(db, workspaceId, facts),
      store.receivableOrders(db, workspaceId, location, {
        includeId: receipt?.purchaseOrderId ?? null,
        excludeReceiptId: receipt?.id,
      }),
      directory.hiddenGrnFields(db, workspaceId),
    ]);
    // The GRN's own supplier stays choosable on edit, even if moved off.
    if (receipt != null && !suppliers.some((s) => s.id === receipt.supplierId))
      suppliers.unshift({
        id: receipt.supplierId,
        name: receipt.supplierName,
        gstin: null,
        stateCode: null,
      });
    return { location: facts, suppliers, purchaseOrders, hiddenFields };
  }

  async post(input: PostGoodsReceiptInput): Promise<StoredGoodsReceipt> {
    const { actor } = input;
    await this.checkDates(input, "create", []);
    const now = new Date();
    const { receipt, events } = await this.deps.store.transaction(
      async (tx) => {
        const location = await this.locationFacts(
          tx,
          actor.workspaceId,
          input.location,
        );
        const built = await this.build(tx, input, location, null);
        const id = newId();
        const { number } = await nextSequenceNumber(tx, {
          workspaceId: actor.workspaceId,
          module: PROCUREMENT_DOCUMENTS.goods_receipt.sequence,
          projectId:
            input.location.kind === "project" ? input.location.id : null,
          date: input.receiptDate,
          by: actor.userId,
        });
        const receipt: StoredGoodsReceipt = {
          id,
          workspaceId: actor.workspaceId,
          location: input.location,
          number,
          receiptDate: input.receiptDate,
          inventoryDate: input.inventoryDate,
          ...built,
          createdAt: now,
          updatedAt: now,
          createdBy: actor.userId,
          updatedBy: actor.userId,
        };
        await this.deps.store.insert(tx, receipt);
        const ledger = await this.deps.ledger.post(
          tx,
          { workspaceId: actor.workspaceId, by: actor.userId },
          postings(receipt),
          { materialNames: materialNames(receipt) },
        );
        if (receipt.purchaseOrderId != null)
          await this.deps.store.recomputeOrderReceipt(
            tx,
            receipt.purchaseOrderId,
          );
        await recordAudit(tx, {
          workspaceId: actor.workspaceId,
          actorUserId: actor.userId,
          action: "goods_receipt.posted",
          entityType: "goods_receipt",
          entityId: id,
          after: snapshot(receipt),
          occurredAt: now,
        });
        return {
          receipt,
          events: [...ledger.events, posted(receipt, "posted", now)],
        };
      },
    );
    await this.deps.dispatcher.dispatch(events);
    return receipt;
  }

  async edit(input: EditGoodsReceiptInput): Promise<StoredGoodsReceipt> {
    const { actor } = input;
    const loaded = await this.get(actor.workspaceId, input.id);
    await this.checkDates(input, "edit", [
      loaded.receiptDate,
      loaded.inventoryDate,
    ]);
    const now = new Date();
    const { receipt, events } = await this.deps.store.transaction(
      async (tx) => {
        const stored = await this.lockLive(tx, input, loaded.id);
        const location = await this.locationFacts(
          tx,
          actor.workspaceId,
          stored.location,
        );
        const built = await this.build(tx, input, location, stored);
        const receipt: StoredGoodsReceipt = {
          ...stored,
          receiptDate: input.receiptDate,
          inventoryDate: input.inventoryDate,
          ...built,
          updatedAt: now,
          updatedBy: actor.userId,
        };
        await this.deps.store.replace(tx, receipt);
        const ledger = await this.deps.ledger.replaceSource(
          tx,
          { workspaceId: actor.workspaceId, by: actor.userId },
          { type: "goods_receipt", id: receipt.id },
          postings(receipt),
          { materialNames: materialNames(stored, receipt) },
        );
        for (const orderId of new Set([
          stored.purchaseOrderId,
          receipt.purchaseOrderId,
        ]))
          if (orderId != null)
            await this.deps.store.recomputeOrderReceipt(tx, orderId);
        await recordAudit(tx, {
          workspaceId: actor.workspaceId,
          actorUserId: actor.userId,
          action: "goods_receipt.updated",
          entityType: "goods_receipt",
          entityId: receipt.id,
          before: snapshot(stored),
          after: snapshot(receipt),
          occurredAt: now,
        });
        return {
          receipt,
          events: [...ledger.events, posted(receipt, "edited", now)],
        };
      },
    );
    await this.deps.dispatcher.dispatch(events);
    return receipt;
  }

  async delete(input: DeleteGoodsReceiptInput): Promise<void> {
    const { actor } = input;
    const loaded = await this.get(actor.workspaceId, input.id);
    const check = await this.deps.backdated(actor);
    check("goods_receipt", "edit", loaded.receiptDate);
    check("goods_receipt", "edit", loaded.inventoryDate);
    const now = new Date();
    const events = await this.deps.store.transaction(async (tx) => {
      const stored = await this.lockLive(tx, input, loaded.id);
      await this.deps.store.tombstone(tx, stored, actor.userId, now);
      const ledger = await this.deps.ledger.reverseSource(
        tx,
        { workspaceId: actor.workspaceId, by: actor.userId },
        { type: "goods_receipt", id: stored.id },
        { materialNames: materialNames(stored) },
      );
      if (stored.purchaseOrderId != null)
        await this.deps.store.recomputeOrderReceipt(tx, stored.purchaseOrderId);
      await recordAudit(tx, {
        workspaceId: actor.workspaceId,
        actorUserId: actor.userId,
        action: "goods_receipt.deleted",
        entityType: "goods_receipt",
        entityId: stored.id,
        before: snapshot(stored),
        occurredAt: now,
      });
      return [...ledger.events, posted(stored, "deleted", now)];
    });
    await this.deps.dispatcher.dispatch(events);
  }

  /** The PDF's data: the GRN as viewed plus the Company's name. */
  async printable(
    receipt: StoredGoodsReceipt,
  ): Promise<{ view: GoodsReceiptView; company: string }> {
    const [view, company] = await Promise.all([
      this.view(receipt),
      this.deps.store.companyName(this.deps.db, receipt.workspaceId),
    ]);
    return { view, company };
  }

  private async checkDates(
    input: ReceiptFields,
    action: "create" | "edit",
    storedDates: readonly CalendarDate[],
  ): Promise<void> {
    const today = await this.deps.today(input.actor.workspaceId);
    assertReceiptDates(input.receiptDate, input.inventoryDate, today);
    const check = await this.deps.backdated(input.actor);
    for (const date of new Set([
      ...storedDates,
      input.receiptDate,
      input.inventoryDate,
    ]))
      check("goods_receipt", action, date);
  }

  /** The GRN locked for a write: live, unchanged since loaded, not paid. */
  private async lockLive(
    tx: Db,
    input: { actor: GoodsReceiptActor; expectedUpdatedAt: Date },
    id: string,
  ): Promise<StoredGoodsReceipt> {
    const stored = await this.deps.store.find(tx, input.actor.workspaceId, id, {
      lock: true,
    });
    if (stored == null) throw goodsReceiptNotFound();
    if (stored.updatedAt.getTime() !== input.expectedUpdatedAt.getTime())
      throw conflict(
        `${NAMING.code}_CHANGED`,
        `Someone changed this ${NAMING.label} after you opened it. Reload to see the latest.`,
      );
    if (await this.deps.payments.isPaid(tx, stored.workspaceId, stored.id))
      throw conflict(
        `${NAMING.code}_PAID`,
        `A supplier payment points at this ${NAMING.label}, so it cannot be changed.`,
      );
    return stored;
  }

  private async locationFacts(
    db: Db,
    workspaceId: string,
    location: StockLocation,
  ): Promise<ReceiptLocationFacts> {
    const facts = await this.deps.store.location(db, workspaceId, location);
    if (facts == null)
      throw location.kind === "project"
        ? new DomainError("PROJECT_NOT_FOUND", "This Project was not found.", {
            details: { field: "locationId" },
          })
        : new DomainError("STORE_NOT_FOUND", "This Store was not found.", {
            details: { field: "locationId" },
          });
    return facts;
  }

  private async supplier(
    tx: Db,
    input: ReceiptFields,
    location: ReceiptLocationFacts,
    stored: StoredGoodsReceipt | null,
  ): Promise<SupplierFacts> {
    const ws = input.actor.workspaceId;
    const supplier = (
      await this.deps.directory.suppliers(tx, ws, [input.supplierId])
    ).get(input.supplierId);
    if (supplier == null)
      throw new DomainError("SUPPLIER_NOT_FOUND", "Choose a Supplier.", {
        details: { field: "supplierId" },
      });
    // An edit may keep its supplier even if it was deactivated or moved off.
    if (stored?.supplierId === supplier.id) return supplier;
    if (!supplier.isActive)
      throw new DomainError(
        "SUPPLIER_INACTIVE",
        "This Supplier is inactive. Activate it in Masters first.",
        { details: { field: "supplierId" } },
      );
    const assigned =
      location.storeSupplierIds == null
        ? supplier.projectIds.includes(location.location.id)
        : location.storeSupplierIds.has(supplier.id);
    if (!assigned)
      throw new DomainError(
        "SUPPLIER_NOT_ON_LOCATION",
        location.location.kind === "project"
          ? "This Supplier is not on the Project. Add it under Resources first."
          : "This Supplier is not on the Store. Add it to the Store first.",
        { details: { field: "supplierId" } },
      );
    return supplier;
  }

  private async linkedOrder(
    tx: Db,
    input: ReceiptFields,
    location: ReceiptLocationFacts,
    supplier: SupplierFacts,
    stored: StoredGoodsReceipt | null,
  ): Promise<OrderFacts | null> {
    const orderId = input.purchaseOrderId ?? null;
    if (orderId == null) return null;
    const order = await this.deps.store.order(
      tx,
      input.actor.workspaceId,
      orderId,
      { lock: true },
    );
    if (order == null)
      throw new DomainError(
        "PURCHASE_ORDER_NOT_FOUND",
        "This Purchase Order was not found.",
        { details: { field: "purchaseOrderId" } },
      );
    if (
      order.location.kind !== location.location.kind ||
      order.location.id !== location.location.id
    )
      throw new DomainError(
        "PURCHASE_ORDER_OTHER_LOCATION",
        `This Purchase Order is for another ${location.location.kind === "project" ? "Project or Store" : "Store or Project"}.`,
        { details: { field: "purchaseOrderId" } },
      );
    if (order.supplierId !== supplier.id)
      throw new DomainError(
        "PURCHASE_ORDER_OTHER_SUPPLIER",
        `This Purchase Order is from ${order.supplierName}. Choose that Supplier or another Purchase Order.`,
        { details: { field: "purchaseOrderId" } },
      );
    // A GRN already on the PO stays on it; a new link needs an open PO.
    if (stored?.purchaseOrderId === order.id) return order;
    if (order.approvalStatus !== "approved")
      throw conflict(
        "PURCHASE_ORDER_NOT_APPROVED",
        "Goods can be received only against an approved Purchase Order.",
        { field: "purchaseOrderId" },
      );
    if (order.closed)
      throw conflict(
        "PURCHASE_ORDER_CLOSED",
        "This Purchase Order is closed: it expects nothing more.",
        { field: "purchaseOrderId" },
      );
    if (order.receiptStatus === "received")
      throw conflict(
        "PURCHASE_ORDER_RECEIVED",
        "This Purchase Order is received in full.",
        { field: "purchaseOrderId" },
      );
    return order;
  }

  /** Validates the form against the masters and the PO, and prices it. */
  private async build(
    tx: Db,
    input: ReceiptFields,
    location: ReceiptLocationFacts,
    stored: StoredGoodsReceipt | null,
  ): Promise<BuiltReceipt> {
    const ws = input.actor.workspaceId;
    if (input.lines.length === 0)
      throw new DomainError(
        "GOODS_RECEIPT_LINES_REQUIRED",
        "Add at least one material received.",
        { details: { field: "lines" } },
      );
    if (input.lines.length > GOODS_RECEIPT_LIMITS.maxLines)
      throw new DomainError(
        "GOODS_RECEIPT_TOO_MANY_LINES",
        `A Goods Receipt has at most ${String(GOODS_RECEIPT_LIMITS.maxLines)} lines.`,
        { details: { field: "lines" } },
      );
    const supplier = await this.supplier(tx, input, location, stored);
    const order = await this.linkedOrder(tx, input, location, supplier, stored);
    const supplyType: SupplyType =
      input.supplyType ??
      (stored != null && stored.purchaseOrderId === (order?.id ?? null)
        ? stored.supplyType
        : (order?.supplyType ??
          defaultSupplyType(supplier.stateCode, location.stateCode)));

    const materialIds =
      order == null
        ? [
            ...new Set(
              input.lines
                .map((line) => line.materialId)
                .filter((id): id is string => id != null),
            ),
          ]
        : [];
    const materials: Map<string, MaterialFacts> =
      materialIds.length === 0
        ? new Map()
        : await this.deps.directory.materials(tx, ws, materialIds);
    const orderLines = new Map(order?.lines.map((line) => [line.id, line]));
    const storedLines = new Map(stored?.lines.map((line) => [line.id, line]));
    const seen = new Set<string>();
    const kept = new Set<string>();

    const lines = input.lines.map((line, index): StoredGoodsReceiptLine => {
      try {
        const quantity = receivedQuantity(line.quantity);
        let base: {
          purchaseOrderItemId: string | null;
          materialId: string;
          materialName: string;
          uomId: string;
          uomName: string;
          hsnCode: string | null;
          unitRate: bigint;
          gstRate: string;
        };
        if (order != null) {
          const orderLine =
            line.purchaseOrderItemId == null
              ? undefined
              : orderLines.get(line.purchaseOrderItemId);
          if (orderLine == null)
            throw new DomainError(
              "GOODS_RECEIPT_LINE_NOT_ON_ORDER",
              "Each line must be a line of the linked Purchase Order.",
              { details: { field: "purchaseOrderItemId" } },
            );
          if (seen.has(orderLine.id))
            throw new DomainError(
              "GOODS_RECEIPT_LINE_REPEATED",
              "A Purchase Order line can be received once per Goods Receipt.",
              { details: { field: "purchaseOrderItemId" } },
            );
          seen.add(orderLine.id);
          base = {
            purchaseOrderItemId: orderLine.id,
            materialId: orderLine.materialId,
            materialName: orderLine.materialName,
            uomId: orderLine.uomId,
            uomName: orderLine.uomName,
            hsnCode: orderLine.hsnCode,
            unitRate: netUnitRate(orderLine),
            gstRate: orderLine.gstRate,
          };
        } else {
          if (line.purchaseOrderItemId != null)
            throw new DomainError(
              "PURCHASE_ORDER_REQUIRED",
              "Link the Purchase Order to receive its lines.",
              { details: { field: "purchaseOrderItemId" } },
            );
          if (line.materialId == null)
            throw new DomainError("MATERIAL_REQUIRED", "Choose a material.", {
              details: { field: "materialId" },
            });
          const material = materials.get(line.materialId);
          if (material == null)
            throw new DomainError(
              "MATERIAL_NOT_FOUND",
              "This material was not found.",
              { details: { field: "materialId" } },
            );
          if (seen.has(material.id))
            throw new DomainError(
              "MATERIAL_REPEATED",
              `${material.name} is on the Goods Receipt twice. Put it on one line.`,
              { details: { field: "materialId" } },
            );
          seen.add(material.id);
          const storedLine =
            line.id == null ? undefined : storedLines.get(line.id);
          if (material.disabled && storedLine?.materialId !== material.id)
            throw new DomainError(
              "MATERIAL_DISABLED",
              `${material.name} is disabled in Masters.`,
              { details: { field: "materialId" } },
            );
          base = {
            purchaseOrderItemId: null,
            materialId: material.id,
            materialName: material.name,
            uomId: material.uomId,
            uomName: material.uomName,
            hsnCode: material.hsnCode,
            unitRate: material.unitRate ?? 0n,
            gstRate: material.gstRate ?? "0.00",
          };
        }
        // A kept line keeps its own rate for a member without Financial.
        const storedLine =
          line.id == null ? undefined : storedLines.get(line.id);
        const keeps =
          storedLine != null &&
          !kept.has(storedLine.id) &&
          storedLine.materialId === base.materialId &&
          storedLine.purchaseOrderItemId === base.purchaseOrderItemId;
        if (keeps) kept.add(storedLine.id);
        const unitRate = input.financial
          ? line.unitRate == null
            ? keeps
              ? storedLine.unitRate
              : base.unitRate
            : paise(line.unitRate)
          : keeps
            ? storedLine.unitRate
            : base.unitRate;
        const gstRate = input.financial
          ? (line.gstRate ?? (keeps ? storedLine.gstRate : base.gstRate))
          : keeps
            ? storedLine.gstRate
            : base.gstRate;
        const amounts = receiptLineAmounts(
          { quantity, unitRate, gstRate },
          supplyType,
        );
        return {
          id: keeps ? storedLine.id : newId(),
          purchaseOrderItemId: base.purchaseOrderItemId,
          position: index + 1,
          materialId: base.materialId,
          materialName: base.materialName,
          uomId: base.uomId,
          uomName: base.uomName,
          hsnCode:
            line.hsnCode === undefined
              ? keeps
                ? storedLine.hsnCode
                : base.hsnCode
              : hsnCode(line.hsnCode),
          receivedQty: quantity,
          unitRate,
          gstRate: normalisePercent(gstRate),
          amounts: {
            taxable: amounts.taxable,
            cgst: amounts.cgst,
            sgst: amounts.sgst,
            igst: amounts.igst,
            total: amounts.total,
          },
        };
      } catch (error) {
        throw lineError(error, index);
      }
    });

    const hidden = await this.deps.directory.hiddenGrnFields(tx, ws);
    const details = goodsReceiptDetails(input.details, {
      hidden,
      financial: input.financial,
      stored: stored?.details ?? null,
    });
    return {
      supplierId: supplier.id,
      supplierName: supplier.name,
      purchaseOrderId: order?.id ?? null,
      supplyType,
      details,
      totals: receiptTotals(
        lines.map((line) => ({
          subTotal: line.amounts.taxable,
          discountAmount: 0n,
          ...line.amounts,
        })),
      ),
      lines,
    };
  }
}

/** `18` → `18.00`, the way `decimal(5,2)` reads back. */
function normalisePercent(value: string): string {
  const [whole = "0", fraction = ""] = value.trim().split(".");
  return `${String(Number(whole))}.${fraction.padEnd(2, "0").slice(0, 2)}`;
}
