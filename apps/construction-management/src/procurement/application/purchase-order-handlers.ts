import type { Prisma } from "@repo/construction-db";

import { assertCan, can, type MemberAccess } from "@/src/shared-kernel/access";
import {
  approve,
  approvedState,
  bulkIds,
  bulkRefused,
  optionalText,
  pendingState,
  reject,
  type ApprovalState,
  type ApprovalStatus,
  type BulkRefusal,
  type DocumentApproved,
} from "@/src/shared-kernel/approval";
import { recordAudit } from "@/src/shared-kernel/audit";
import {
  assertCalendarDate,
  type CalendarDate,
} from "@/src/shared-kernel/calendar-date";
import {
  conflict,
  DomainError,
  notFound,
} from "@/src/shared-kernel/domain-error";
import type { EventDispatcher } from "@/src/shared-kernel/events";
import type {
  DocumentTotals,
  LineDiscount,
  SupplyType,
} from "@/src/shared-kernel/gst-line";
import { newId } from "@/src/shared-kernel/ids";
import type { ProjectMediaRemoved } from "@/src/shared-kernel/project-media";
import type { ListCursor } from "@/src/shared-kernel/list-cursor";
import {
  locationRef,
  type LocationRef,
  type LocationRefInput,
  type LocationResolver,
} from "@/src/shared-kernel/location-ref";
import { nextSequenceNumber } from "@/src/shared-kernel/sequence/next-sequence-number";

import { gallerySourceOf } from "../domain/document-thread";
import { PROCUREMENT_DOCUMENTS } from "../domain/documents";
import {
  assertCanMarkPurchaseOrderOrdered,
  assertExpectedDeliveryDate,
  assertPurchaseOrderDeletable,
  assertSafePaise,
  closeReason,
  deliveryAddress,
  editedApproval,
  paymentTermsDays,
  placeOfSupply,
  pointOfContact,
  PURCHASE_ORDER,
  PURCHASE_ORDER_LIMITS,
  purchaseOrderLines,
  purchaseOrderTotals,
  supplyTypeFor,
  type PurchaseOrderLine,
  type PurchaseOrderLineInput,
  type PurchaseOrderState,
  type ReceiptStatus,
} from "../domain/purchase-order";
import {
  assertCanOrderAgainst,
  assertNotFuture,
} from "../domain/purchase-request";
import type { StockLocation } from "../domain/stock-location";
import type { ProcurementDirectory } from "./ports";
import {
  stateOf as purchaseRequestState,
  type BackdatedCheck,
  type PurchaseRequestStore,
  type StoredPurchaseRequest,
} from "./purchase-request-handlers";

type Db = Prisma.TransactionClient;

const DOCUMENT = PROCUREMENT_DOCUMENTS.purchase_order;
const MENU = DOCUMENT.menu;

export const purchaseOrderNotFound = () =>
  notFound("PURCHASE_ORDER_NOT_FOUND", "This Purchase Order was not found.");

function invalid(code: string, message: string, field: string): DomainError {
  return new DomainError(code, message, { details: { field } });
}

// ---------------------------------------------------------------------------
// Store port (Prisma in `infrastructure/prisma-purchase-order-store`)
// ---------------------------------------------------------------------------

export type StoredPurchaseOrderItem = Omit<PurchaseOrderLine, never> & {
  id: string;
  position: number;
  /** Decimal string. */
  receivedQty: string;
};

export type StoredPurchaseOrderTerm = {
  termsId: string | null;
  title: string;
  body: string;
};

/** What a save writes besides numbering and bookkeeping. */
export type PurchaseOrderContent = {
  orderDate: CalendarDate;
  expectedDeliveryDate: CalendarDate;
  purchaseRequestId: string | null;
  supplierId: string;
  supplierName: string;
  supplierGstin: string | null;
  supplierStateCode: string | null;
  siteLocation: LocationRef | null;
  supplyType: SupplyType;
  placeOfSupplyStateCode: string | null;
  billingAddressId: string;
  billingName: string;
  billingAddress: string;
  billingStateCode: string | null;
  billingGstin: string | null;
  supplierPocName: string | null;
  supplierPocMobile: string | null;
  sitePocName: string | null;
  sitePocMobile: string | null;
  paymentTermsDays: number | null;
  deliveryAddressDiffers: boolean;
  deliveryAddress: string | null;
  deliveryStateCode: string | null;
  remark: string | null;
  totals: DocumentTotals;
  lines: PurchaseOrderLine[];
  terms: StoredPurchaseOrderTerm[];
};

export type StoredPurchaseOrder = Omit<PurchaseOrderContent, "lines"> & {
  id: string;
  workspaceId: string;
  location: StockLocation;
  number: string;
  approval: ApprovalState;
  orderedAt: Date | null;
  orderedBy: string | null;
  receiptStatus: ReceiptStatus;
  closedAt: Date | null;
  closedBy: string | null;
  closeReason: string | null;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
  updatedBy: string;
  items: StoredPurchaseOrderItem[];
};

export type PurchaseOrderListParams = {
  workspaceId: string;
  location: StockLocation;
  from?: CalendarDate;
  to?: CalendarDate;
  approvalStatus?: ApprovalStatus;
  receiptStatus?: ReceiptStatus;
  supplierId?: string;
  purchaseRequestId?: string;
  limit: number;
  after?: ListCursor;
  before?: ListCursor;
};

export type LinkedGoodsReceipt = {
  id: string;
  number: string;
  receiptDate: CalendarDate;
};

export type StoreFacts = {
  id: string;
  name: string;
  address: string | null;
  stateCode: string | null;
  supplierIds: readonly string[];
};

export type PurchaseOrderStore = {
  find(
    db: Db,
    workspaceId: string,
    id: string,
  ): Promise<StoredPurchaseOrder | null>;
  lock(
    db: Db,
    workspaceId: string,
    ids: readonly string[],
  ): Promise<StoredPurchaseOrder[]>;
  insert(
    db: Db,
    row: PurchaseOrderContent & {
      id: string;
      workspaceId: string;
      location: StockLocation;
      number: string;
      approval: ApprovalState;
      by: string;
      at: Date;
    },
  ): Promise<void>;
  replace(
    db: Db,
    id: string,
    content: PurchaseOrderContent & {
      approval: ApprovalState;
      by: string;
      at: Date;
    },
  ): Promise<void>;
  setApproval(
    db: Db,
    id: string,
    approval: ApprovalState,
    by: string,
    at: Date,
  ): Promise<void>;
  markOrdered(db: Db, id: string, by: string, at: Date): Promise<void>;
  close(
    db: Db,
    id: string,
    reason: string,
    by: string,
    at: Date,
  ): Promise<void>;
  tombstone(db: Db, id: string, by: string, at: Date): Promise<void>;
  /** Live Goods Receipts pointing at it. */
  goodsReceipts(
    db: Db,
    workspaceId: string,
    id: string,
  ): Promise<LinkedGoodsReceipt[]>;
  list(
    db: Db,
    params: PurchaseOrderListParams,
  ): Promise<{ items: StoredPurchaseOrder[]; hasMore: boolean; total: number }>;
  /** Suppliers on the location's live POs, for the filter. */
  supplierFacets(
    db: Db,
    workspaceId: string,
    location: StockLocation,
  ): Promise<{ id: string; name: string }[]>;
  store(db: Db, workspaceId: string, id: string): Promise<StoreFacts | null>;
  purchaseRequestNumbers(
    db: Db,
    workspaceId: string,
    ids: readonly string[],
  ): Promise<Map<string, string>>;
};

/** Keeps PR `ordered_qty` / `order_status` in step (`purchase-request-ordering`). */
export type PurchaseRequestOrdering = (
  db: Db,
  workspaceId: string,
  purchaseRequestIds: readonly (string | null | undefined)[],
) => Promise<void>;

export type PurchaseOrderDeps = {
  db: Db & { $transaction<T>(fn: (tx: Db) => Promise<T>): Promise<T> };
  store: PurchaseOrderStore;
  purchaseRequests: PurchaseRequestStore;
  ordering: PurchaseRequestOrdering;
  directory: ProcurementDirectory;
  locations: LocationResolver;
  backdated: (actor: MemberAccess) => Promise<BackdatedCheck>;
  today: (workspaceId: string) => Promise<CalendarDate>;
  events: EventDispatcher;
  /** `ProjectMediaRemoved` for the document's Gallery tiles on delete (ADR CM-0014). */
  media: EventDispatcher;
  clock?: () => Date;
};

// ---------------------------------------------------------------------------
// Inputs and read models
// ---------------------------------------------------------------------------

export type PurchaseOrderLineRequest = {
  materialId: string;
  purchaseRequestItemId?: string | null;
  quantity: string;
  unitRate: number;
  discount?:
    | { type: "amount"; paise: number }
    | { type: "percent"; percent: string }
    | null;
  gstRate?: string | null;
  hsnCode?: string | null;
  remark?: string | null;
};

export type PurchaseOrderInput = {
  orderDate: string;
  /** Defaults to the PR's Required Date. */
  expectedDeliveryDate?: string | null;
  purchaseRequestId?: string | null;
  supplierId: string;
  siteLocation?: LocationRefInput | null;
  /** Overrides the default from the states. */
  supplyType?: SupplyType | null;
  /** Defaults to the Company's default billing address. */
  billingAddressId?: string | null;
  supplierPoc?: { name?: string | null; mobile?: string | null } | null;
  sitePoc?: { name?: string | null; mobile?: string | null } | null;
  paymentTermsDays?: number | null;
  termsIds?: readonly string[];
  deliveryAddressDiffers?: boolean;
  deliveryAddress?: string | null;
  deliveryStateCode?: string | null;
  remark?: string | null;
  /** Paise. */
  additionalCharges?: number;
  deductionAmount?: number;
  items: readonly PurchaseOrderLineRequest[];
  approve?: boolean;
};

export type PurchaseOrderActions = {
  edit: boolean;
  delete: boolean;
  approve: boolean;
  reject: boolean;
  markOrdered: boolean;
  close: boolean;
  print: boolean;
};

export type PurchaseOrderReadModel = StoredPurchaseOrder & {
  createdByName: string | null;
  decidedByName: string | null;
  orderedByName: string | null;
  closedByName: string | null;
  purchaseRequestNumber: string | null;
};

export type PurchaseOrderDetail = PurchaseOrderReadModel & {
  goodsReceipts: LinkedGoodsReceipt[];
};

export function purchaseOrderState(
  po: StoredPurchaseOrder,
): PurchaseOrderState {
  return {
    approvalStatus: po.approval.status,
    orderedAt: po.orderedAt,
    closedAt: po.closedAt,
    receiptStatus: po.receiptStatus,
  };
}

/** The Permission Matrix scope of a PO: its Project, or none for a Store. */
export function purchaseOrderScope(location: StockLocation): {
  projectId?: string;
} {
  return location.kind === "project" ? { projectId: location.id } : {};
}

export function purchaseOrderActions(
  access: MemberAccess,
  po: StoredPurchaseOrder,
): PurchaseOrderActions {
  const scope = purchaseOrderScope(po.location);
  const pending = po.approval.status === "pending";
  const open = po.orderedAt == null && po.closedAt == null;
  const updateOrApprove =
    can(access, MENU, "update", scope) || can(access, MENU, "approve", scope);
  return {
    edit: open && can(access, MENU, "update", scope),
    delete: can(access, MENU, "delete", scope),
    approve: pending && can(access, MENU, "approve", scope),
    reject: pending && can(access, MENU, "reject", scope),
    markOrdered:
      po.approval.status === "approved" &&
      po.orderedAt == null &&
      updateOrApprove,
    close:
      po.orderedAt != null &&
      po.closedAt == null &&
      po.receiptStatus !== "received" &&
      can(access, MENU, "update", scope),
    print: can(access, MENU, "print", scope),
  };
}

function changed(po: StoredPurchaseOrder, expectedUpdatedAt: Date | undefined) {
  if (
    expectedUpdatedAt != null &&
    po.updatedAt.getTime() !== expectedUpdatedAt.getTime()
  )
    throw conflict(
      "PURCHASE_ORDER_CHANGED",
      "Someone changed this Purchase Order. Reload it and try again.",
      { updatedAt: po.updatedAt.toISOString() },
    );
}

function paise(value: number | undefined, field: string): bigint {
  if (value == null) return 0n;
  if (!Number.isSafeInteger(value) || value < 0)
    throw invalid("AMOUNT_INVALID", "Enter an amount of 0 or more.", field);
  return BigInt(value);
}

function lineDiscount(
  discount: PurchaseOrderLineRequest["discount"],
  index: number,
): LineDiscount {
  if (discount == null) return null;
  if (discount.type === "percent") return discount;
  if (!Number.isSafeInteger(discount.paise) || discount.paise < 0)
    throw new DomainError(
      "DISCOUNT_INVALID",
      "A discount cannot be negative.",
      {
        details: { index },
      },
    );
  return { type: "amount", paise: BigInt(discount.paise) };
}

/** What the audit log keeps of a PO (bigints as numbers). */
function snapshot(
  po: PurchaseOrderContent | StoredPurchaseOrder,
  approval?: ApprovalState,
) {
  const lines = "lines" in po ? po.lines : po.items;
  return {
    orderDate: po.orderDate,
    expectedDeliveryDate: po.expectedDeliveryDate,
    purchaseRequestId: po.purchaseRequestId,
    supplierId: po.supplierId,
    supplyType: po.supplyType,
    billingAddressId: po.billingAddressId,
    grandTotal: Number(po.totals.grandTotal),
    approvalStatus:
      approval?.status ?? ("approval" in po ? po.approval.status : undefined),
    items: lines.map((line) => ({
      materialId: line.materialId,
      quantity: line.quantity,
      unitRate: Number(line.unitRate),
      total: Number(line.total),
    })),
  };
}

type Located = {
  kind: "project" | "store";
  id: string;
  name: string;
  address: string | null;
  stateCode: string | null;
  supplierIds: readonly string[] | null;
};

/**
 * Purchase Order commands and queries (CM-504). Every save prices the lines
 * with the kernel's GST math (the client's totals are never read), and every
 * create, edit, reject and delete recomputes the linked Purchase Request's
 * ordered quantities in the same transaction.
 */
export class PurchaseOrderHandlers {
  private readonly clock: () => Date;

  constructor(private readonly deps: PurchaseOrderDeps) {
    this.clock = deps.clock ?? (() => new Date());
  }

  /** The Project or Store a PO is for, with its state and (for a Store) suppliers. */
  async location(
    workspaceId: string,
    location: StockLocation,
  ): Promise<Located> {
    const { db, directory, store } = this.deps;
    if (location.kind === "project") {
      const project = (
        await directory.projects(db, workspaceId, [location.id])
      ).get(location.id);
      if (project == null)
        throw invalid(
          "PROJECT_NOT_FOUND",
          "This Project was not found.",
          "locationId",
        );
      return {
        kind: "project",
        id: project.id,
        name: project.name,
        address: project.address,
        stateCode: project.stateCode,
        supplierIds: null,
      };
    }
    const found = await store.store(db, workspaceId, location.id);
    if (found == null)
      throw invalid(
        "STORE_NOT_FOUND",
        "This Store was not found.",
        "locationId",
      );
    return { kind: "store", ...found };
  }

  private async content(
    access: MemberAccess,
    located: Located,
    input: PurchaseOrderInput,
    current: StoredPurchaseOrder | null,
    tx: Db,
  ): Promise<{
    content: PurchaseOrderContent;
    purchaseRequest: StoredPurchaseRequest | null;
  }> {
    const { directory, locations, purchaseRequests } = this.deps;
    const ws = access.workspaceId;
    const orderDate = assertCalendarDate(input.orderDate, "ORDER_DATE_INVALID");
    assertNotFuture(orderDate, await this.deps.today(ws), "orderDate");

    // Purchase Request: approved or partially ordered (unless unchanged on an edit).
    let purchaseRequest: StoredPurchaseRequest | null = null;
    const prId = input.purchaseRequestId ?? null;
    if (prId != null) {
      if (located.kind !== "project")
        throw invalid(
          "PURCHASE_REQUEST_NOT_ALLOWED",
          "A Store's Purchase Order cannot be raised from a Purchase Request.",
          "purchaseRequestId",
        );
      purchaseRequest =
        (await purchaseRequests.lock(tx, ws, [prId]))[0] ?? null;
      if (purchaseRequest?.projectId !== located.id)
        throw invalid(
          "PURCHASE_REQUEST_NOT_FOUND",
          "This Purchase Request was not found on the Project.",
          "purchaseRequestId",
        );
      if (current?.purchaseRequestId !== prId)
        assertCanOrderAgainst(purchaseRequestState(purchaseRequest));
    }
    const prItems = new Map(
      purchaseRequest?.items.map((item) => [item.id, item]) ?? [],
    );
    input.items.forEach((item, index) => {
      if (item.purchaseRequestItemId == null) return;
      const prItem = prItems.get(item.purchaseRequestItemId);
      if (prItem?.materialId !== item.materialId)
        throw new DomainError(
          "PURCHASE_REQUEST_ITEM_NOT_FOUND",
          "This line is not an item of the chosen Purchase Request.",
          {
            details: { field: "purchaseRequestItemId", index },
          },
        );
    });

    const expectedRaw =
      input.expectedDeliveryDate ?? purchaseRequest?.requiredDate ?? null;
    if (expectedRaw == null || expectedRaw === "")
      throw invalid(
        "EXPECTED_DELIVERY_DATE_REQUIRED",
        "Enter the Expected Delivery Date.",
        "expectedDeliveryDate",
      );
    const expectedDeliveryDate = assertCalendarDate(
      expectedRaw,
      "EXPECTED_DELIVERY_DATE_INVALID",
    );
    assertExpectedDeliveryDate(orderDate, expectedDeliveryDate);

    // Supplier: live, active, on the Project (Resources) or the Store.
    const supplier = (
      await directory.suppliers(tx, ws, [input.supplierId])
    ).get(input.supplierId);
    if (supplier == null)
      throw invalid(
        "SUPPLIER_NOT_FOUND",
        "This Supplier was not found.",
        "supplierId",
      );
    if (!supplier.isActive)
      throw invalid(
        "SUPPLIER_INACTIVE",
        "This Supplier is inactive.",
        "supplierId",
      );
    const assigned =
      located.kind === "project"
        ? supplier.projectIds.includes(located.id)
        : (located.supplierIds ?? []).includes(supplier.id);
    if (!assigned)
      throw invalid(
        located.kind === "project"
          ? "SUPPLIER_NOT_ON_PROJECT"
          : "SUPPLIER_NOT_ON_STORE",
        located.kind === "project"
          ? "This Supplier is not assigned to the Project."
          : "This Supplier is not assigned to the Store.",
        "supplierId",
      );

    // Billing address: given, or the Company's default.
    const billing =
      input.billingAddressId == null
        ? await directory.defaultBillingAddress(tx, ws)
        : ((
            await directory.billingAddresses(tx, ws, [input.billingAddressId])
          ).get(input.billingAddressId) ?? null);
    if (billing == null)
      throw invalid(
        input.billingAddressId == null
          ? "BILLING_ADDRESS_REQUIRED"
          : "BILLING_ADDRESS_NOT_FOUND",
        input.billingAddressId == null
          ? "Choose a billing address."
          : "This billing address was not found.",
        "billingAddressId",
      );

    // Site location (Projects only).
    let siteLocation: LocationRef | null = null;
    if (input.siteLocation != null) {
      if (located.kind !== "project")
        throw invalid(
          "SITE_LOCATION_NOT_ALLOWED",
          "A Store has no site locations.",
          "siteLocation",
        );
      siteLocation = locationRef(input.siteLocation);
      await locations.assertOnProject(ws, located.id, siteLocation);
    }

    // Terms & Conditions: copied at save.
    const termsIds = [...new Set(input.termsIds ?? [])];
    if (termsIds.length > PURCHASE_ORDER_LIMITS.maxTerms)
      throw invalid(
        "TOO_MANY_TERMS",
        `Choose at most ${String(PURCHASE_ORDER_LIMITS.maxTerms)} Terms & Conditions.`,
        "termsIds",
      );
    const termFacts = await directory.terms(tx, ws, termsIds);
    const missingTerms = termsIds.filter(
      (id) => termFacts.get(id) == null || termFacts.get(id)?.disabled === true,
    );
    if (missingTerms.length > 0)
      throw new DomainError(
        "TERMS_NOT_FOUND",
        "Some Terms & Conditions were not found. Choose them again.",
        {
          details: { field: "termsIds", ids: missingTerms },
        },
      );

    const delivery = deliveryAddress({
      differs: input.deliveryAddressDiffers === true,
      address: input.deliveryAddress,
      stateCode: input.deliveryStateCode,
    });
    const placeOfSupplyStateCode = placeOfSupply({
      ...delivery,
      locationStateCode: located.stateCode,
    });
    const supplyType = supplyTypeFor({
      requested: input.supplyType ?? null,
      supplierStateCode: supplier.stateCode,
      placeOfSupplyStateCode,
    });

    const materials = await directory.materials(
      tx,
      ws,
      input.items.map((item) => item.materialId),
    );
    const lineInputs: PurchaseOrderLineInput[] = input.items.map(
      (item, index) => {
        if (!Number.isSafeInteger(item.unitRate) || item.unitRate < 0)
          throw new DomainError(
            "UNIT_RATE_INVALID",
            "Enter a rate of 0 or more.",
            { details: { index } },
          );
        return {
          materialId: item.materialId,
          purchaseRequestItemId: item.purchaseRequestItemId ?? null,
          quantity: item.quantity,
          unitRate: BigInt(item.unitRate),
          discount: lineDiscount(item.discount, index),
          gstRate: item.gstRate ?? null,
          hsnCode: item.hsnCode ?? null,
          remark: item.remark ?? null,
        };
      },
    );
    const lines = purchaseOrderLines(lineInputs, materials, supplyType);
    const totals = purchaseOrderTotals(lines, {
      additionalCharges: paise(input.additionalCharges, "additionalCharges"),
      deductionAmount: paise(input.deductionAmount, "deductionAmount"),
    });
    for (const [field, value] of Object.entries(totals))
      assertSafePaise(value, field);

    const supplierPoc = pointOfContact(input.supplierPoc ?? {}, "supplierPoc");
    const sitePoc = pointOfContact(input.sitePoc ?? {}, "sitePoc");
    return {
      purchaseRequest,
      content: {
        orderDate,
        expectedDeliveryDate,
        purchaseRequestId: prId,
        supplierId: supplier.id,
        supplierName: supplier.name,
        supplierGstin: supplier.gstin,
        supplierStateCode: supplier.stateCode,
        siteLocation,
        supplyType,
        placeOfSupplyStateCode,
        billingAddressId: billing.id,
        billingName: billing.name,
        billingAddress: billing.address,
        billingStateCode: billing.stateCode,
        billingGstin: billing.gstin,
        supplierPocName: supplierPoc.name,
        supplierPocMobile: supplierPoc.mobile,
        sitePocName: sitePoc.name,
        sitePocMobile: sitePoc.mobile,
        paymentTermsDays: paymentTermsDays(input.paymentTermsDays),
        ...delivery,
        remark: optionalText(input.remark, "remark"),
        totals,
        lines,
        terms: termsIds.map((id) => {
          const term = termFacts.get(id);
          if (term == null) throw new Error("checked above");
          return { termsId: id, title: term.title, body: term.body };
        }),
      },
    };
  }

  private async dispatchApproved(
    pos:
      | readonly StoredPurchaseOrder[]
      | readonly { id: string; workspaceId: string; location: StockLocation }[],
    by: string,
    at: Date,
  ) {
    if (pos.length === 0) return;
    await this.deps.events.dispatch(
      pos.map((po): DocumentApproved => ({
        type: "document.approved",
        workspaceId: po.workspaceId,
        occurredAt: at,
        documentType: DOCUMENT.type,
        documentId: po.id,
        projectId: po.location.kind === "project" ? po.location.id : null,
        approvedBy: by,
      })),
    );
  }

  async create(
    access: MemberAccess,
    location: StockLocation,
    input: PurchaseOrderInput,
  ): Promise<string> {
    const scope = purchaseOrderScope(location);
    assertCan(access, MENU, "create", scope);
    if (input.approve === true) assertCan(access, MENU, "approve", scope);
    const located = await this.location(access.workspaceId, location);
    const check = await this.deps.backdated(access);
    const id = newId();
    const at = this.clock();
    const approval =
      input.approve === true
        ? approvedState({ userId: access.userId, at })
        : pendingState();
    await this.deps.db.$transaction(async (tx) => {
      const { content } = await this.content(access, located, input, null, tx);
      check(DOCUMENT.backdated, "create", content.orderDate);
      const { number } = await nextSequenceNumber(tx, {
        workspaceId: access.workspaceId,
        module: DOCUMENT.sequence,
        projectId: location.kind === "project" ? location.id : null,
        date: content.orderDate,
        by: access.userId,
      });
      await this.deps.store.insert(tx, {
        ...content,
        id,
        workspaceId: access.workspaceId,
        location,
        number,
        approval,
        by: access.userId,
        at,
      });
      await this.deps.ordering(tx, access.workspaceId, [
        content.purchaseRequestId,
      ]);
      await recordAudit(tx, {
        workspaceId: access.workspaceId,
        actorUserId: access.userId,
        action: "purchase_order.created",
        entityType: "purchase_order",
        entityId: id,
        after: { number, location, ...snapshot(content, approval) },
        occurredAt: at,
      });
    });
    if (approval.status === "approved")
      await this.dispatchApproved(
        [{ id, workspaceId: access.workspaceId, location }],
        access.userId,
        at,
      );
    return id;
  }

  async find(workspaceId: string, id: string): Promise<StoredPurchaseOrder> {
    const po = await this.deps.store.find(this.deps.db, workspaceId, id);
    if (po == null) throw purchaseOrderNotFound();
    return po;
  }

  private async readModels(
    workspaceId: string,
    rows: StoredPurchaseOrder[],
  ): Promise<PurchaseOrderReadModel[]> {
    const { db, purchaseRequests, store } = this.deps;
    const users = new Set<string>();
    for (const row of rows)
      for (const user of [
        row.createdBy,
        row.approval.decidedBy,
        row.orderedBy,
        row.closedBy,
      ])
        if (user != null) users.add(user);
    const [names, numbers] = await Promise.all([
      purchaseRequests.names(db, workspaceId, [...users]),
      store.purchaseRequestNumbers(
        db,
        workspaceId,
        rows.flatMap((row) =>
          row.purchaseRequestId == null ? [] : [row.purchaseRequestId],
        ),
      ),
    ]);
    const name = (user: string | null) =>
      user == null ? null : (names.get(user) ?? null);
    return rows.map((row) => ({
      ...row,
      createdByName: name(row.createdBy),
      decidedByName: name(row.approval.decidedBy),
      orderedByName: name(row.orderedBy),
      closedByName: name(row.closedBy),
      purchaseRequestNumber:
        row.purchaseRequestId == null
          ? null
          : (numbers.get(row.purchaseRequestId) ?? null),
    }));
  }

  async get(workspaceId: string, id: string): Promise<PurchaseOrderDetail> {
    const po = await this.find(workspaceId, id);
    const [model] = await this.readModels(workspaceId, [po]);
    if (model == null) throw purchaseOrderNotFound();
    return {
      ...model,
      goodsReceipts: await this.deps.store.goodsReceipts(
        this.deps.db,
        workspaceId,
        id,
      ),
    };
  }

  async list(params: PurchaseOrderListParams) {
    const { db, store } = this.deps;
    const [page, suppliers] = await Promise.all([
      store.list(db, params),
      store.supplierFacets(db, params.workspaceId, params.location),
    ]);
    return {
      ...page,
      items: await this.readModels(params.workspaceId, page.items),
      facets: { suppliers },
    };
  }

  async edit(
    access: MemberAccess,
    id: string,
    expectedUpdatedAt: Date,
    input: PurchaseOrderInput,
  ): Promise<void> {
    const current = await this.find(access.workspaceId, id);
    const scope = purchaseOrderScope(current.location);
    assertCan(access, MENU, "update", scope);
    if (input.approve === true) assertCan(access, MENU, "approve", scope);
    const located = await this.location(access.workspaceId, current.location);
    const check = await this.deps.backdated(access);
    const at = this.clock();
    let approval: ApprovalState = pendingState();
    await this.deps.db.$transaction(async (tx) => {
      const [locked] = await this.deps.store.lock(tx, access.workspaceId, [id]);
      if (locked == null) throw purchaseOrderNotFound();
      changed(locked, expectedUpdatedAt);
      approval = editedApproval(
        purchaseOrderState(locked),
        input.approve === true ? { userId: access.userId, at } : null,
      );
      const { content } = await this.content(
        access,
        located,
        input,
        locked,
        tx,
      );
      check(DOCUMENT.backdated, "edit", locked.orderDate);
      if (content.orderDate !== locked.orderDate)
        check(DOCUMENT.backdated, "edit", content.orderDate);
      await this.deps.store.replace(tx, id, {
        ...content,
        approval,
        by: access.userId,
        at,
      });
      await this.deps.ordering(tx, access.workspaceId, [
        locked.purchaseRequestId,
        content.purchaseRequestId,
      ]);
      await recordAudit(tx, {
        workspaceId: access.workspaceId,
        actorUserId: access.userId,
        action: "purchase_order.updated",
        entityType: "purchase_order",
        entityId: id,
        before: snapshot(locked),
        after: snapshot(content, approval),
        occurredAt: at,
      });
    });
    if (approval.status === "approved")
      await this.dispatchApproved([current], access.userId, at);
  }

  async delete(
    access: MemberAccess,
    id: string,
    expectedUpdatedAt: Date,
  ): Promise<void> {
    const current = await this.find(access.workspaceId, id);
    assertCan(access, MENU, "delete", purchaseOrderScope(current.location));
    const check = await this.deps.backdated(access);
    const at = this.clock();
    await this.deps.db.$transaction(async (tx) => {
      const [locked] = await this.deps.store.lock(tx, access.workspaceId, [id]);
      if (locked == null) throw purchaseOrderNotFound();
      changed(locked, expectedUpdatedAt);
      assertPurchaseOrderDeletable(
        (await this.deps.store.goodsReceipts(tx, access.workspaceId, id))
          .length,
      );
      check(DOCUMENT.backdated, "edit", locked.orderDate);
      await this.deps.store.tombstone(tx, id, access.userId, at);
      await this.deps.ordering(tx, access.workspaceId, [
        locked.purchaseRequestId,
      ]);
      await recordAudit(tx, {
        workspaceId: access.workspaceId,
        actorUserId: access.userId,
        action: "purchase_order.deleted",
        entityType: "purchase_order",
        entityId: id,
        before: { number: locked.number, ...snapshot(locked) },
        occurredAt: at,
      });
    });
    if (current.location.kind === "project")
      await this.deps.media.dispatch([
        removedMedia({
          type: "ProjectMediaRemoved",
          workspaceId: access.workspaceId,
          occurredAt: at,
          projectId: current.location.id,
          source: gallerySourceOf(DOCUMENT.type),
          sourceId: id,
        }),
      ]);
  }

  async decide(
    access: MemberAccess,
    id: string,
    decision: { approve: true } | { approve: false; reason: string },
    expectedUpdatedAt?: Date,
  ): Promise<void> {
    const current = await this.find(access.workspaceId, id);
    assertCan(
      access,
      MENU,
      decision.approve ? "approve" : "reject",
      purchaseOrderScope(current.location),
    );
    await this.decideMany(
      access,
      current.location,
      [id],
      decision,
      false,
      expectedUpdatedAt,
    );
  }

  /** All or none at one Project or Store (CM-0015 §2). */
  async bulkDecide(
    access: MemberAccess,
    location: StockLocation,
    ids: readonly string[],
    decision: { approve: true } | { approve: false; reason: string },
  ): Promise<number> {
    assertCan(
      access,
      MENU,
      decision.approve ? "approve" : "reject",
      purchaseOrderScope(location),
    );
    const unique = bulkIds(ids);
    await this.decideMany(access, location, unique, decision, true);
    return unique.length;
  }

  private async decideMany(
    access: MemberAccess,
    location: StockLocation,
    ids: readonly string[],
    decision: { approve: true } | { approve: false; reason: string },
    bulk: boolean,
    expectedUpdatedAt?: Date,
  ): Promise<void> {
    const at = this.clock();
    const by = { userId: access.userId, at };
    const approved: StoredPurchaseOrder[] = [];
    await this.deps.db.$transaction(async (tx) => {
      const locked = new Map(
        (await this.deps.store.lock(tx, access.workspaceId, ids)).map((po) => [
          po.id,
          po,
        ]),
      );
      const refusals: BulkRefusal[] = [];
      const next = new Map<string, ApprovalState>();
      for (const id of ids) {
        const po = locked.get(id);
        if (
          po?.location.kind !== location.kind ||
          po.location.id !== location.id
        ) {
          if (!bulk) throw purchaseOrderNotFound();
          refusals.push({
            id,
            code: "PURCHASE_ORDER_NOT_FOUND",
            message: "This Purchase Order was not found.",
          });
          continue;
        }
        if (!bulk) changed(po, expectedUpdatedAt);
        try {
          next.set(
            id,
            decision.approve
              ? approve(po.approval, by, PURCHASE_ORDER)
              : reject(po.approval, by, decision.reason, PURCHASE_ORDER),
          );
        } catch (error) {
          if (!bulk || !(error instanceof DomainError)) throw error;
          refusals.push({ id, code: error.code, message: error.message });
        }
      }
      if (refusals.length > 0) throw bulkRefused(refusals);
      for (const [id, approval] of next) {
        await this.deps.store.setApproval(tx, id, approval, access.userId, at);
        await recordAudit(tx, {
          workspaceId: access.workspaceId,
          actorUserId: access.userId,
          action: decision.approve
            ? "purchase_order.approved"
            : "purchase_order.rejected",
          entityType: "purchase_order",
          entityId: id,
          after: {
            approvalStatus: approval.status,
            rejectionReason: approval.rejectionReason,
            bulk,
          },
          occurredAt: at,
        });
        const po = locked.get(id);
        if (decision.approve && po != null) approved.push(po);
      }
      // A rejected PO stops counting towards its PR's ordered quantity.
      if (!decision.approve)
        await this.deps.ordering(
          tx,
          access.workspaceId,
          [...next.keys()].map((id) => locked.get(id)?.purchaseRequestId),
        );
    });
    await this.dispatchApproved(approved, access.userId, at);
  }

  /** Mark as Ordered: sent to the supplier; approved, not yet ordered. */
  async markOrdered(
    access: MemberAccess,
    id: string,
    expectedUpdatedAt?: Date,
  ): Promise<void> {
    const current = await this.find(access.workspaceId, id);
    const scope = purchaseOrderScope(current.location);
    if (!can(access, MENU, "approve", scope))
      assertCan(access, MENU, "update", scope);
    const at = this.clock();
    await this.deps.db.$transaction(async (tx) => {
      const [locked] = await this.deps.store.lock(tx, access.workspaceId, [id]);
      if (locked == null) throw purchaseOrderNotFound();
      changed(locked, expectedUpdatedAt);
      assertCanMarkPurchaseOrderOrdered(purchaseOrderState(locked));
      await this.deps.store.markOrdered(tx, id, access.userId, at);
      await recordAudit(tx, {
        workspaceId: access.workspaceId,
        actorUserId: access.userId,
        action: "purchase_order.marked_ordered",
        entityType: "purchase_order",
        entityId: id,
        occurredAt: at,
      });
    });
  }

  /** Close an ordered, short-supplied PO with a reason (§8). */
  async close(
    access: MemberAccess,
    id: string,
    reason: string,
    expectedUpdatedAt?: Date,
  ): Promise<void> {
    const current = await this.find(access.workspaceId, id);
    assertCan(access, MENU, "update", purchaseOrderScope(current.location));
    const at = this.clock();
    await this.deps.db.$transaction(async (tx) => {
      const [locked] = await this.deps.store.lock(tx, access.workspaceId, [id]);
      if (locked == null) throw purchaseOrderNotFound();
      changed(locked, expectedUpdatedAt);
      const text = closeReason(purchaseOrderState(locked), reason);
      await this.deps.store.close(tx, id, text, access.userId, at);
      await recordAudit(tx, {
        workspaceId: access.workspaceId,
        actorUserId: access.userId,
        action: "purchase_order.closed",
        entityType: "purchase_order",
        entityId: id,
        after: { closeReason: text },
        occurredAt: at,
      });
    });
  }
}

function removedMedia(event: ProjectMediaRemoved): ProjectMediaRemoved {
  return event;
}
