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
import type { DomainEvent, EventDispatcher } from "@/src/shared-kernel/events";
import { newId } from "@/src/shared-kernel/ids";
import type { ProjectMediaRemoved } from "@/src/shared-kernel/project-media";
import type { ListCursor } from "@/src/shared-kernel/list-cursor";
import {
  locationRef,
  type LocationRef,
  type LocationRefInput,
  type LocationResolver,
  type LocationType,
} from "@/src/shared-kernel/location-ref";
import { nextSequenceNumber } from "@/src/shared-kernel/sequence/next-sequence-number";

import { gallerySourceOf } from "../domain/document-thread";
import { PROCUREMENT_DOCUMENTS } from "../domain/documents";
import {
  assertCanMarkOrdered,
  assertNotFuture,
  assertPurchaseRequestDeletable,
  assertPurchaseRequestEditable,
  assertRequiredDate,
  balancedEstimatedQty,
  isOrderable,
  PURCHASE_REQUEST,
  purchaseRequestLines,
  type OrderStatus,
  type PurchaseRequestLine,
  type PurchaseRequestLineInput,
  type PurchaseRequestSource,
} from "../domain/purchase-request";
import type { ProcurementDirectory } from "./ports";

type Db = Prisma.TransactionClient;

/** Checks one entry date against the Back-dated Entry policy (CM-113). */
export type BackdatedCheck = (
  module: (typeof PROCUREMENT_DOCUMENTS)[keyof typeof PROCUREMENT_DOCUMENTS]["backdated"],
  action: "create" | "edit",
  date: CalendarDate,
) => void;

const DOCUMENT = PROCUREMENT_DOCUMENTS.purchase_request;
const MENU = DOCUMENT.menu;

export const purchaseRequestNotFound = () =>
  notFound(
    "PURCHASE_REQUEST_NOT_FOUND",
    "This Purchase Request was not found.",
  );

// ---------------------------------------------------------------------------
// The store port (Prisma in `infrastructure/prisma-purchase-request-store`)
// ---------------------------------------------------------------------------

export type StoredPurchaseRequestItem = {
  id: string;
  position: number;
  materialId: string;
  materialName: string;
  categoryId: string | null;
  uomId: string;
  uomName: string;
  quantity: string;
  remark: string | null;
  orderedQty: string;
};

export type StoredPurchaseRequest = {
  id: string;
  workspaceId: string;
  projectId: string;
  number: string;
  requestDate: CalendarDate;
  requiredDate: CalendarDate | null;
  siteLocation: LocationRef | null;
  remark: string | null;
  separateRemarks: boolean;
  commonRemark: string | null;
  source: PurchaseRequestSource;
  approval: ApprovalState;
  orderStatus: OrderStatus;
  markedOrderedAt: Date | null;
  markedOrderedBy: string | null;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
  updatedBy: string;
  items: StoredPurchaseRequestItem[];
};

/** What a save writes besides the bookkeeping columns. */
export type PurchaseRequestContent = {
  requestDate: CalendarDate;
  requiredDate: CalendarDate | null;
  siteLocation: LocationRef | null;
  remark: string | null;
  separateRemarks: boolean;
  commonRemark: string | null;
  lines: PurchaseRequestLine[];
};

export type PurchaseRequestListParams = {
  workspaceId: string;
  projectId: string;
  from?: CalendarDate;
  to?: CalendarDate;
  approvalStatus?: ApprovalStatus;
  orderStatus?: OrderStatus;
  categoryId?: string;
  materialId?: string;
  createdBy?: string;
  locationType?: LocationType;
  limit: number;
  after?: ListCursor;
  before?: ListCursor;
};

export type PurchaseRequestFacets = {
  creators: { userId: string; name: string }[];
  materials: { id: string; name: string; categoryId: string | null }[];
};

export type LinkedPurchaseOrder = {
  id: string;
  number: string;
  orderDate: CalendarDate;
  supplierName: string;
  approvalStatus: ApprovalStatus;
  grandTotal: bigint;
};

export type PurchaseRequestStore = {
  find(
    db: Db,
    workspaceId: string,
    id: string,
  ): Promise<StoredPurchaseRequest | null>;
  /** Locks the rows `FOR UPDATE` (in id order) and reads them. */
  lock(
    db: Db,
    workspaceId: string,
    ids: readonly string[],
  ): Promise<StoredPurchaseRequest[]>;
  insert(
    db: Db,
    row: PurchaseRequestContent & {
      id: string;
      workspaceId: string;
      projectId: string;
      number: string;
      source: PurchaseRequestSource;
      approval: ApprovalState;
      by: string;
      at: Date;
    },
  ): Promise<void>;
  replace(
    db: Db,
    id: string,
    content: PurchaseRequestContent & {
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
  tombstone(db: Db, id: string, by: string, at: Date): Promise<void>;
  /** PO lines of live Purchase Orders (any approval) pointing at its items. */
  orderLineCount(db: Db, id: string): Promise<number>;
  linkedOrders(
    db: Db,
    workspaceId: string,
    id: string,
  ): Promise<LinkedPurchaseOrder[]>;
  list(
    db: Db,
    params: PurchaseRequestListParams,
  ): Promise<{
    items: StoredPurchaseRequest[];
    hasMore: boolean;
    total: number;
  }>;
  facets(
    db: Db,
    workspaceId: string,
    projectId: string,
  ): Promise<PurchaseRequestFacets>;
  /** Team Member names by User id. */
  names(
    db: Db,
    workspaceId: string,
    userIds: readonly string[],
  ): Promise<Map<string, string>>;
  /**
   * Per material at the Project: requested but not yet ordered on live,
   * non-rejected PRs (not marked ordered), plus ordered but not yet
   * received on live, non-rejected, not closed POs.
   */
  onTheWay(
    db: Db,
    workspaceId: string,
    projectId: string,
    materialIds: readonly string[],
    excludePurchaseRequestId: string | null,
  ): Promise<Map<string, string>>;
  estimatedQuantities(
    db: Db,
    workspaceId: string,
    projectId: string,
    materialIds: readonly string[],
  ): Promise<Map<string, string>>;
};

export type StockReader = {
  stock(
    db: Db,
    workspaceId: string,
    location: { kind: "project" | "store"; id: string },
    materialIds?: readonly string[],
  ): Promise<Map<string, string>>;
};

export type PurchaseRequestDeps = {
  db: Db & {
    $transaction<T>(fn: (tx: Db) => Promise<T>): Promise<T>;
  };
  store: PurchaseRequestStore;
  directory: ProcurementDirectory;
  locations: LocationResolver;
  stock: StockReader;
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

export type PurchaseRequestInput = {
  requestDate: string;
  requiredDate?: string | null;
  siteLocation?: LocationRefInput | null;
  remark?: string | null;
  separateRemarks: boolean;
  commonRemark?: string | null;
  items: readonly PurchaseRequestLineInput[];
  /** Save & Approve: needs Approve. */
  approve?: boolean;
};

export type PurchaseRequestActions = {
  edit: boolean;
  delete: boolean;
  approve: boolean;
  reject: boolean;
  markOrdered: boolean;
  /** Generate PO: Purchase Order create on the Project, and orderable. */
  generateOrder: boolean;
  print: boolean;
};

export type PurchaseRequestReadModel = StoredPurchaseRequest & {
  createdByName: string | null;
  decidedByName: string | null;
  markedOrderedByName: string | null;
  categoryNames: Map<string, string>;
};

export type PurchaseRequestDetail = PurchaseRequestReadModel & {
  purchaseOrders: LinkedPurchaseOrder[];
};

export type QuantityInfo = {
  materialId: string;
  /** Decimal strings. */
  availableStock: string;
  estimatedQty: string | null;
  onTheWay: string;
  balancedEstimatedQty: string | null;
};

/** The state the domain's edit and fulfilment rules read. */
export function stateOf(pr: StoredPurchaseRequest) {
  return {
    approvalStatus: pr.approval.status,
    orderStatus: pr.orderStatus,
    markedOrderedAt: pr.markedOrderedAt,
  };
}

/** What the caller may do with a Purchase Request now (screens hide the rest). */
export function purchaseRequestActions(
  access: MemberAccess,
  pr: StoredPurchaseRequest,
): PurchaseRequestActions {
  const scope = { projectId: pr.projectId };
  const pending = pr.approval.status === "pending";
  return {
    edit:
      can(access, MENU, "update", scope) && pr.approval.status !== "approved",
    delete: can(access, MENU, "delete", scope),
    approve: pending && can(access, MENU, "approve", scope),
    reject: pending && can(access, MENU, "reject", scope),
    markOrdered:
      isOrderable(stateOf(pr)) &&
      (can(access, MENU, "update", scope) ||
        can(access, MENU, "approve", scope)),
    generateOrder:
      isOrderable(stateOf(pr)) &&
      can(access, "procurement.purchase_orders", "create", scope),
    print: can(access, MENU, "print", scope),
  };
}

/** What the audit log keeps of a Purchase Request. */
function snapshot(pr: {
  requestDate: string;
  requiredDate: string | null;
  siteLocation: LocationRef | null;
  remark: string | null;
  separateRemarks: boolean;
  commonRemark: string | null;
  approval?: ApprovalState;
  items?: readonly {
    materialId: string;
    quantity: string;
    remark: string | null;
  }[];
  lines?: readonly {
    materialId: string;
    quantity: string;
    remark: string | null;
  }[];
}) {
  return {
    requestDate: pr.requestDate,
    requiredDate: pr.requiredDate,
    siteLocation: pr.siteLocation,
    remark: pr.remark,
    separateRemarks: pr.separateRemarks,
    commonRemark: pr.commonRemark,
    approvalStatus: pr.approval?.status,
    items: (pr.items ?? pr.lines ?? []).map((item) => ({
      materialId: item.materialId,
      quantity: item.quantity,
      remark: item.remark,
    })),
  };
}

function changed(
  pr: StoredPurchaseRequest,
  expectedUpdatedAt: Date | undefined,
) {
  if (
    expectedUpdatedAt != null &&
    pr.updatedAt.getTime() !== expectedUpdatedAt.getTime()
  )
    throw conflict(
      "PURCHASE_REQUEST_CHANGED",
      "Someone changed this Purchase Request. Reload it and try again.",
      { updatedAt: pr.updatedAt.toISOString() },
    );
}

/**
 * Purchase Request commands and queries (CM-503). Every write is one
 * transaction: the row lock, the back-dated check, the number, the rows
 * and the audit event; `document.approved` is dispatched after commit.
 * Permissions are checked here as well as in the routes, because some
 * depend on the request (Save & Approve) or its Project.
 */
export class PurchaseRequestHandlers {
  private readonly clock: () => Date;

  constructor(private readonly deps: PurchaseRequestDeps) {
    this.clock = deps.clock ?? (() => new Date());
  }

  private async content(
    access: MemberAccess,
    projectId: string,
    input: PurchaseRequestInput,
  ): Promise<PurchaseRequestContent> {
    const { db, directory, locations } = this.deps;
    const requestDate = assertCalendarDate(
      input.requestDate,
      "REQUEST_DATE_INVALID",
    );
    const requiredDate =
      input.requiredDate == null || input.requiredDate === ""
        ? null
        : assertCalendarDate(input.requiredDate, "REQUIRED_DATE_INVALID");
    assertNotFuture(
      requestDate,
      await this.deps.today(access.workspaceId),
      "requestDate",
    );
    assertRequiredDate(requestDate, requiredDate);
    const materials = await directory.materials(
      db,
      access.workspaceId,
      input.items.map((item) => item.materialId),
    );
    const lines = purchaseRequestLines(
      input.items,
      materials,
      input.separateRemarks,
    );
    let siteLocation: LocationRef | null = null;
    if (input.siteLocation != null) {
      siteLocation = locationRef(input.siteLocation);
      await locations.assertOnProject(
        access.workspaceId,
        projectId,
        siteLocation,
      );
    }
    return {
      requestDate,
      requiredDate,
      siteLocation,
      remark: optionalText(input.remark, "remark"),
      separateRemarks: input.separateRemarks,
      commonRemark: input.separateRemarks
        ? null
        : optionalText(input.commonRemark, "commonRemark"),
      lines,
    };
  }

  private async dispatchApproved(
    pr: { id: string; workspaceId: string; projectId: string },
    by: string,
    at: Date,
  ) {
    const event: DocumentApproved = {
      type: "document.approved",
      workspaceId: pr.workspaceId,
      occurredAt: at,
      documentType: DOCUMENT.type,
      documentId: pr.id,
      projectId: pr.projectId,
      approvedBy: by,
    };
    await this.deps.events.dispatch([event]);
  }

  async create(
    access: MemberAccess,
    input: PurchaseRequestInput & {
      projectId: string;
      source?: PurchaseRequestSource;
    },
  ): Promise<string> {
    const scope = { projectId: input.projectId };
    assertCan(access, MENU, "create", scope);
    if (input.approve === true) assertCan(access, MENU, "approve", scope);
    const { db, directory, store } = this.deps;
    const projects = await directory.projects(db, access.workspaceId, [
      input.projectId,
    ]);
    if (!projects.has(input.projectId))
      throw new DomainError(
        "PROJECT_NOT_FOUND",
        "This Project was not found.",
        {
          details: { field: "projectId" },
        },
      );
    const content = await this.content(access, input.projectId, input);
    const check = await this.deps.backdated(access);
    const id = newId();
    const at = this.clock();
    const approval =
      input.approve === true
        ? approvedState({ userId: access.userId, at })
        : pendingState();
    await db.$transaction(async (tx) => {
      check(DOCUMENT.backdated, "create", content.requestDate);
      const { number } = await nextSequenceNumber(tx, {
        workspaceId: access.workspaceId,
        module: DOCUMENT.sequence,
        projectId: input.projectId,
        date: content.requestDate,
        by: access.userId,
      });
      await store.insert(tx, {
        ...content,
        id,
        workspaceId: access.workspaceId,
        projectId: input.projectId,
        number,
        source: input.source ?? "manual",
        approval,
        by: access.userId,
        at,
      });
      await recordAudit(tx, {
        workspaceId: access.workspaceId,
        actorUserId: access.userId,
        action: "purchase_request.created",
        entityType: "purchase_request",
        entityId: id,
        after: { number, ...snapshot({ ...content, approval }) },
        occurredAt: at,
      });
    });
    if (approval.status === "approved")
      await this.dispatchApproved(
        { id, workspaceId: access.workspaceId, projectId: input.projectId },
        access.userId,
        at,
      );
    return id;
  }

  async find(workspaceId: string, id: string): Promise<StoredPurchaseRequest> {
    const pr = await this.deps.store.find(this.deps.db, workspaceId, id);
    if (pr == null) throw purchaseRequestNotFound();
    return pr;
  }

  private async readModels(
    workspaceId: string,
    rows: StoredPurchaseRequest[],
  ): Promise<PurchaseRequestReadModel[]> {
    const { db, store, directory } = this.deps;
    const userIds = new Set<string>();
    const materialIds = new Set<string>();
    for (const row of rows) {
      userIds.add(row.createdBy);
      if (row.approval.decidedBy != null) userIds.add(row.approval.decidedBy);
      if (row.markedOrderedBy != null) userIds.add(row.markedOrderedBy);
      for (const item of row.items)
        if (item.categoryId != null) materialIds.add(item.materialId);
    }
    const [names, materials] = await Promise.all([
      store.names(db, workspaceId, [...userIds]),
      directory.materials(db, workspaceId, [...materialIds]),
    ]);
    const categoryNames = new Map<string, string>();
    for (const material of materials.values())
      if (material.categoryId != null && material.categoryName != null)
        categoryNames.set(material.categoryId, material.categoryName);
    return rows.map((row) => ({
      ...row,
      createdByName: names.get(row.createdBy) ?? null,
      decidedByName:
        row.approval.decidedBy == null
          ? null
          : (names.get(row.approval.decidedBy) ?? null),
      markedOrderedByName:
        row.markedOrderedBy == null
          ? null
          : (names.get(row.markedOrderedBy) ?? null),
      categoryNames,
    }));
  }

  async get(workspaceId: string, id: string): Promise<PurchaseRequestDetail> {
    const pr = await this.find(workspaceId, id);
    const [model] = await this.readModels(workspaceId, [pr]);
    if (model == null) throw purchaseRequestNotFound();
    const purchaseOrders = await this.deps.store.linkedOrders(
      this.deps.db,
      workspaceId,
      id,
    );
    return { ...model, purchaseOrders };
  }

  async list(params: PurchaseRequestListParams) {
    const { db, store, directory } = this.deps;
    const [page, facets] = await Promise.all([
      store.list(db, params),
      store.facets(db, params.workspaceId, params.projectId),
    ]);
    const materials = await directory.materials(
      db,
      params.workspaceId,
      facets.materials.filter((m) => m.categoryId != null).map((m) => m.id),
    );
    const categories = new Map<string, string>();
    for (const material of materials.values())
      if (material.categoryId != null && material.categoryName != null)
        categories.set(material.categoryId, material.categoryName);
    return {
      ...page,
      items: await this.readModels(params.workspaceId, page.items),
      facets: {
        creators: facets.creators,
        materials: facets.materials.map(({ id, name }) => ({ id, name })),
        categories: [...categories]
          .map(([id, name]) => ({ id, name }))
          .sort((a, b) => a.name.localeCompare(b.name)),
      },
    };
  }

  async edit(
    access: MemberAccess,
    id: string,
    expectedUpdatedAt: Date,
    input: PurchaseRequestInput,
  ): Promise<void> {
    const { db, store } = this.deps;
    const current = await this.find(access.workspaceId, id);
    const scope = { projectId: current.projectId };
    assertCan(access, MENU, "update", scope);
    if (input.approve === true) assertCan(access, MENU, "approve", scope);
    const content = await this.content(access, current.projectId, input);
    const check = await this.deps.backdated(access);
    const at = this.clock();
    const approval =
      input.approve === true
        ? approvedState({ userId: access.userId, at })
        : pendingState();
    await db.$transaction(async (tx) => {
      const [locked] = await store.lock(tx, access.workspaceId, [id]);
      if (locked == null) throw purchaseRequestNotFound();
      changed(locked, expectedUpdatedAt);
      assertPurchaseRequestEditable(stateOf(locked));
      check(DOCUMENT.backdated, "edit", locked.requestDate);
      if (content.requestDate !== locked.requestDate)
        check(DOCUMENT.backdated, "edit", content.requestDate);
      await store.replace(tx, id, {
        ...content,
        approval,
        by: access.userId,
        at,
      });
      await recordAudit(tx, {
        workspaceId: access.workspaceId,
        actorUserId: access.userId,
        action: "purchase_request.updated",
        entityType: "purchase_request",
        entityId: id,
        before: snapshot(locked),
        after: snapshot({ ...content, approval }),
        occurredAt: at,
      });
    });
    if (approval.status === "approved")
      await this.dispatchApproved(current, access.userId, at);
  }

  async delete(
    access: MemberAccess,
    id: string,
    expectedUpdatedAt: Date,
  ): Promise<void> {
    const { db, store } = this.deps;
    const current = await this.find(access.workspaceId, id);
    assertCan(access, MENU, "delete", { projectId: current.projectId });
    const check = await this.deps.backdated(access);
    const at = this.clock();
    await db.$transaction(async (tx) => {
      const [locked] = await store.lock(tx, access.workspaceId, [id]);
      if (locked == null) throw purchaseRequestNotFound();
      changed(locked, expectedUpdatedAt);
      assertPurchaseRequestDeletable(await store.orderLineCount(tx, id));
      check(DOCUMENT.backdated, "edit", locked.requestDate);
      await store.tombstone(tx, id, access.userId, at);
      await recordAudit(tx, {
        workspaceId: access.workspaceId,
        actorUserId: access.userId,
        action: "purchase_request.deleted",
        entityType: "purchase_request",
        entityId: id,
        before: { number: locked.number, ...snapshot(locked) },
        occurredAt: at,
      });
    });
    await this.deps.media.dispatch([
      removedMedia({
        type: "ProjectMediaRemoved",
        workspaceId: access.workspaceId,
        occurredAt: at,
        projectId: current.projectId,
        source: gallerySourceOf(DOCUMENT.type),
        sourceId: id,
      }),
    ]);
  }

  /** Approve or reject one (single: 409 when not pending). */
  async decide(
    access: MemberAccess,
    id: string,
    decision: { approve: true } | { approve: false; reason: string },
    expectedUpdatedAt?: Date,
  ): Promise<void> {
    const current = await this.find(access.workspaceId, id);
    assertCan(access, MENU, decision.approve ? "approve" : "reject", {
      projectId: current.projectId,
    });
    await this.decideMany(
      access,
      current.projectId,
      [id],
      decision,
      false,
      expectedUpdatedAt,
    );
  }

  /**
   * Bulk approve or reject on one Project: all or none (CM-0015 §2). Any
   * id that is not this Project's, or not pending, refuses the whole set
   * with 409 `BULK_DECISION_REFUSED` listing each refusal.
   */
  async bulkDecide(
    access: MemberAccess,
    projectId: string,
    ids: readonly string[],
    decision: { approve: true } | { approve: false; reason: string },
  ): Promise<number> {
    assertCan(access, MENU, decision.approve ? "approve" : "reject", {
      projectId,
    });
    const unique = bulkIds(ids);
    await this.decideMany(access, projectId, unique, decision, true);
    return unique.length;
  }

  private async decideMany(
    access: MemberAccess,
    projectId: string,
    ids: readonly string[],
    decision: { approve: true } | { approve: false; reason: string },
    bulk: boolean,
    expectedUpdatedAt?: Date,
  ): Promise<void> {
    const { db, store } = this.deps;
    const at = this.clock();
    const by = { userId: access.userId, at };
    const approved: StoredPurchaseRequest[] = [];
    await db.$transaction(async (tx) => {
      const locked = new Map(
        (await store.lock(tx, access.workspaceId, ids)).map((pr) => [
          pr.id,
          pr,
        ]),
      );
      const refusals: BulkRefusal[] = [];
      const next = new Map<string, ApprovalState>();
      for (const id of ids) {
        const pr = locked.get(id);
        if (pr?.projectId !== projectId) {
          if (!bulk) throw purchaseRequestNotFound();
          refusals.push({
            id,
            code: "PURCHASE_REQUEST_NOT_FOUND",
            message: "This Purchase Request was not found.",
          });
          continue;
        }
        if (!bulk) changed(pr, expectedUpdatedAt);
        try {
          next.set(
            id,
            decision.approve
              ? approve(pr.approval, by, PURCHASE_REQUEST)
              : reject(pr.approval, by, decision.reason, PURCHASE_REQUEST),
          );
        } catch (error) {
          if (!bulk || !(error instanceof DomainError)) throw error;
          refusals.push({ id, code: error.code, message: error.message });
        }
      }
      if (refusals.length > 0) throw bulkRefused(refusals);
      for (const [id, approval] of next) {
        await store.setApproval(tx, id, approval, access.userId, at);
        await recordAudit(tx, {
          workspaceId: access.workspaceId,
          actorUserId: access.userId,
          action: decision.approve
            ? "purchase_request.approved"
            : "purchase_request.rejected",
          entityType: "purchase_request",
          entityId: id,
          after: {
            approvalStatus: approval.status,
            rejectionReason: approval.rejectionReason,
            bulk,
          },
          occurredAt: at,
        });
        const pr = locked.get(id);
        if (decision.approve && pr != null) approved.push(pr);
      }
    });
    const events: DomainEvent[] = approved.map((pr): DocumentApproved => ({
      type: "document.approved",
      workspaceId: pr.workspaceId,
      occurredAt: at,
      documentType: DOCUMENT.type,
      documentId: pr.id,
      projectId: pr.projectId,
      approvedBy: access.userId,
    }));
    if (events.length > 0) await this.deps.events.dispatch(events);
  }

  /** Mark as Ordered (ordered outside the app): approved or partially ordered. */
  async markOrdered(
    access: MemberAccess,
    id: string,
    expectedUpdatedAt?: Date,
  ): Promise<void> {
    const { db, store } = this.deps;
    const current = await this.find(access.workspaceId, id);
    const scope = { projectId: current.projectId };
    if (!can(access, MENU, "approve", scope))
      assertCan(access, MENU, "update", scope);
    const at = this.clock();
    await db.$transaction(async (tx) => {
      const [locked] = await store.lock(tx, access.workspaceId, [id]);
      if (locked == null) throw purchaseRequestNotFound();
      changed(locked, expectedUpdatedAt);
      assertCanMarkOrdered(stateOf(locked));
      await store.markOrdered(tx, id, access.userId, at);
      await recordAudit(tx, {
        workspaceId: access.workspaceId,
        actorUserId: access.userId,
        action: "purchase_request.marked_ordered",
        entityType: "purchase_request",
        entityId: id,
        before: { orderStatus: locked.orderStatus },
        after: { orderStatus: "ordered" },
        occurredAt: at,
      });
    });
  }

  /**
   * Available Stock and Balanced estimated qty per material at the
   * Project (wizard step 2): estimated (`stock_settings`) − (stock +
   * requested or ordered and not yet received).
   */
  async quantityInfo(
    workspaceId: string,
    projectId: string,
    materialIds: readonly string[],
    excludePurchaseRequestId: string | null,
  ): Promise<QuantityInfo[]> {
    const { db, store, stock } = this.deps;
    const ids = [...new Set(materialIds)];
    if (ids.length === 0) return [];
    const [stocks, estimates, onTheWay] = await Promise.all([
      stock.stock(db, workspaceId, { kind: "project", id: projectId }, ids),
      store.estimatedQuantities(db, workspaceId, projectId, ids),
      store.onTheWay(db, workspaceId, projectId, ids, excludePurchaseRequestId),
    ]);
    const fixed = (value: string | undefined) =>
      value == null
        ? "0.000"
        : Number(value) === 0
          ? "0.000"
          : normalise(value);
    return ids.map((materialId) => {
      const availableStock = fixed(stocks.get(materialId));
      const way = fixed(onTheWay.get(materialId));
      const estimated = estimates.get(materialId);
      const estimatedQty = estimated == null ? null : normalise(estimated);
      return {
        materialId,
        availableStock,
        estimatedQty,
        onTheWay: way,
        balancedEstimatedQty: balancedEstimatedQty(
          estimatedQty,
          availableStock,
          way,
        ),
      };
    });
  }
}

/** A Postgres numeric string as three decimals ("12.5" → "12.500"). */
function normalise(value: string): string {
  const negative = value.startsWith("-");
  const [whole = "0", fraction = ""] = (
    negative ? value.slice(1) : value
  ).split(".");
  return `${negative ? "-" : ""}${whole}.${fraction.padEnd(3, "0").slice(0, 3)}`;
}

function removedMedia(event: ProjectMediaRemoved): ProjectMediaRemoved {
  return event;
}
