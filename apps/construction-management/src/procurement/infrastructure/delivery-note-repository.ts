import { Prisma, type PrismaClient } from "@repo/construction-db";

import { bulkRefused, type BulkRefusal } from "@/src/shared-kernel/approval";
import { recordAudit } from "@/src/shared-kernel/audit";
import {
  calendarDateFromDb,
  calendarDateToDb,
  type CalendarDate,
} from "@/src/shared-kernel/calendar-date";
import { DomainError, notFound } from "@/src/shared-kernel/domain-error";
import type { DomainEvent, EventDispatcher } from "@/src/shared-kernel/events";
import { newId } from "@/src/shared-kernel/ids";
import type { LocationRef } from "@/src/shared-kernel/location-ref";
import { Quantity } from "@/src/shared-kernel/quantity";
import { nextSequenceNumber } from "@/src/shared-kernel/sequence/next-sequence-number";

import type {
  DeliveryNoteDraft,
  DeliveryNoteListPage,
  DeliveryNoteListParams,
  DeliveryNoteReadModel,
  DeliveryNoteRepository,
} from "../application/delivery-note-handlers";
import type { ProcurementDirectory } from "../application/ports";
import type { ProcurementCommandActor } from "../application/store-handlers";
import {
  assertDeliverable,
  assertDeliveryNotePending,
  deliveryNoteLines,
  deliveryNoteStatus,
  type RequestLineAvailability,
} from "../domain/delivery-note";
import { PROCUREMENT_DOCUMENTS } from "../domain/documents";
import {
  deriveMaterialRequestStatus,
  isOpenMaterialRequest,
  MATERIAL_REQUEST_STATUS_LABELS,
  pendingQuantity,
} from "../domain/material-request";
import type { StockPosting } from "../domain/stock-ledger";
import {
  assertNotFuture,
  changed,
  inFlightByItem,
  removeFromGallery,
  type PrismaMaterialRequestRepository,
} from "./material-request-repository";
import { loadBackdatedCheck } from "./procurement-guards";
import type { PrismaStockLedger } from "./prisma-stock-ledger";
import { cursorOrder, cursorWhere } from "./store-repository";

type Tx = Prisma.TransactionClient;

const DOC = PROCUREMENT_DOCUMENTS.delivery_note;

const include = {
  items: { orderBy: { position: "asc" as const } },
  materialRequest: {
    select: {
      number: true,
      items: { select: { id: true, askQty: true, deliveredQty: true } },
    },
  },
} as const;

type Row = Prisma.ConstructionProcurementDeliveryNoteGetPayload<{
  include: typeof include;
}>;

export function deliveryNoteNotFound(): DomainError {
  return notFound(
    "DELIVERY_NOTE_NOT_FOUND",
    "This Delivery Note was not found.",
  );
}

/** Delivery Notes in `construction_procurement.delivery_notes` (CM-508). */
export class PrismaDeliveryNoteRepository implements DeliveryNoteRepository {
  constructor(
    private readonly db: PrismaClient,
    private readonly directory: ProcurementDirectory,
    private readonly requests: PrismaMaterialRequestRepository,
    private readonly ledger: PrismaStockLedger,
    private readonly events: EventDispatcher,
    /** The Gallery's dispatcher: files of a deleted note leave it. */
    private readonly media: EventDispatcher = events,
  ) {}

  async list(params: DeliveryNoteListParams): Promise<DeliveryNoteListPage> {
    const where: Prisma.ConstructionProcurementDeliveryNoteWhereInput = {
      workspaceId: params.workspaceId,
      deletedAt: null,
    };
    if (params.storeId != null) where.storeId = params.storeId;
    if (params.projectId != null) where.projectId = params.projectId;
    if (params.materialRequestId != null)
      where.materialRequestId = params.materialRequestId;
    if (params.status === "pending") where.approvalStatus = "pending";
    if (params.status === "in_transit") {
      where.approvalStatus = "approved";
      where.deliveredAt = null;
    }
    if (params.status === "delivered") where.deliveredAt = { not: null };
    const search = params.search?.trim() ?? "";
    if (search !== "") where.number = { contains: search, mode: "insensitive" };
    const backwards = params.before != null;
    const cursor = cursorWhere(params.after ?? params.before, backwards);
    const [page, total] = await Promise.all([
      this.db.constructionProcurementDeliveryNote.findMany({
        where: cursor == null ? where : { AND: [where, cursor] },
        include,
        orderBy: cursorOrder(backwards),
        take: params.limit + 1,
      }),
      this.db.constructionProcurementDeliveryNote.count({ where }),
    ]);
    const hasMore = page.length > params.limit;
    const rows = page.slice(0, params.limit);
    if (backwards) rows.reverse();
    return {
      items: await this.readModels(this.db, params.workspaceId, rows),
      hasMore,
      total,
    };
  }

  async find(workspaceId: string, id: string) {
    const row = await this.db.constructionProcurementDeliveryNote.findFirst({
      where: { id, workspaceId, deletedAt: null },
      include,
    });
    if (row == null) return null;
    const [model] = await this.readModels(this.db, workspaceId, [row]);
    return model ?? null;
  }

  async create(
    actor: ProcurementCommandActor,
    materialRequestId: string,
    draft: DeliveryNoteDraft,
    approve: boolean,
  ): Promise<DeliveryNoteReadModel> {
    await assertNotFuture(
      this.db,
      actor.workspaceId,
      draft.deliveryDate,
      "deliveryDate",
    );
    const backdated = await loadBackdatedCheck(this.db, actor);
    backdated(DOC.backdated, "create", draft.deliveryDate);
    const id = newId();
    const now = new Date();
    const events: DomainEvent[] = [];
    const result = await this.db.$transaction(async (tx) => {
      const request = await this.requests
        .lock(tx, actor.workspaceId, materialRequestId)
        .catch((error: unknown) => {
          if (error instanceof DomainError && error.kind === "not_found")
            throw new DomainError(
              "MATERIAL_REQUEST_NOT_FOUND",
              "This Material Request was not found.",
              { details: { field: "materialRequestId" } },
            );
          throw error;
        });
      if (!isOpenMaterialRequest(request.status))
        throw new DomainError(
          "MATERIAL_REQUEST_NOT_OPEN",
          `This Material Request is ${MATERIAL_REQUEST_STATUS_LABELS[request.status].toLowerCase()}; nothing is left to deliver.`,
          { kind: "conflict", details: { status: request.status } },
        );
      const lines = await this.checkLines(
        tx,
        actor.workspaceId,
        request,
        draft,
        null,
      );
      const { number } = await nextSequenceNumber(tx, {
        workspaceId: actor.workspaceId,
        module: DOC.sequence,
        projectId: null,
        date: draft.deliveryDate,
        by: actor.userId,
      });
      await tx.constructionProcurementDeliveryNote.create({
        data: {
          id,
          workspaceId: actor.workspaceId,
          number,
          materialRequestId,
          storeId: request.storeId,
          projectId: request.projectId,
          deliveryDate: calendarDateToDb(draft.deliveryDate),
          deliveredTo: draft.deliveredTo,
          remark: draft.remark,
          createdAt: now,
          updatedAt: now,
          createdBy: actor.userId,
          updatedBy: actor.userId,
          items: { create: lines },
        },
      });
      await recordAudit(tx, {
        workspaceId: actor.workspaceId,
        actorUserId: actor.userId,
        action: "delivery_note.created",
        entityType: "delivery_note",
        entityId: id,
        after: { number, materialRequestId, ...snapshotDraft(draft) },
        occurredAt: now,
      });
      if (approve) events.push(...(await this.approveOne(tx, actor, id, now)));
      return this.mustLoad(tx, actor.workspaceId, id);
    });
    await this.events.dispatch(events);
    return result;
  }

  async update(
    actor: ProcurementCommandActor,
    id: string,
    draft: DeliveryNoteDraft,
    expectedUpdatedAt: Date,
  ): Promise<DeliveryNoteReadModel> {
    const current = await this.find(actor.workspaceId, id);
    if (current == null) throw deliveryNoteNotFound();
    await assertNotFuture(
      this.db,
      actor.workspaceId,
      draft.deliveryDate,
      "deliveryDate",
    );
    const backdated = await loadBackdatedCheck(this.db, actor);
    backdated(DOC.backdated, "edit", current.deliveryDate);
    if (draft.deliveryDate !== current.deliveryDate)
      backdated(DOC.backdated, "edit", draft.deliveryDate);
    const now = new Date();
    return this.db.$transaction(async (tx) => {
      const request = await this.requests.lock(
        tx,
        actor.workspaceId,
        current.materialRequestId,
      );
      const before = await this.lock(tx, actor.workspaceId, id);
      if (before.updatedAt.getTime() !== expectedUpdatedAt.getTime())
        throw changed("DELIVERY_NOTE_CHANGED", DOC.naming.label);
      assertDeliveryNotePending(deliveryNoteStatus(before));
      const lines = await this.checkLines(
        tx,
        actor.workspaceId,
        request,
        draft,
        id,
      );
      await tx.constructionProcurementDeliveryNoteItem.deleteMany({
        where: { deliveryNoteId: id },
      });
      await tx.constructionProcurementDeliveryNote.update({
        where: { id },
        data: {
          deliveryDate: calendarDateToDb(draft.deliveryDate),
          deliveredTo: draft.deliveredTo,
          remark: draft.remark,
          updatedAt: now,
          updatedBy: actor.userId,
          items: { create: lines },
        },
      });
      await recordAudit(tx, {
        workspaceId: actor.workspaceId,
        actorUserId: actor.userId,
        action: "delivery_note.updated",
        entityType: "delivery_note",
        entityId: id,
        before: snapshotRow(before),
        after: snapshotDraft(draft),
        occurredAt: now,
      });
      return this.mustLoad(tx, actor.workspaceId, id);
    });
  }

  async delete(
    actor: ProcurementCommandActor,
    id: string,
    expectedUpdatedAt: Date,
  ): Promise<void> {
    const current = await this.find(actor.workspaceId, id);
    if (current == null) throw deliveryNoteNotFound();
    const backdated = await loadBackdatedCheck(this.db, actor);
    backdated(DOC.backdated, "edit", current.deliveryDate);
    const now = new Date();
    await this.db.$transaction(async (tx) => {
      const before = await this.lock(tx, actor.workspaceId, id);
      if (before.updatedAt.getTime() !== expectedUpdatedAt.getTime())
        throw changed("DELIVERY_NOTE_CHANGED", DOC.naming.label);
      assertDeliveryNotePending(deliveryNoteStatus(before));
      await tx.constructionProcurementDeliveryNote.update({
        where: { id },
        data: {
          deletedAt: now,
          deletedBy: actor.userId,
          updatedAt: now,
          updatedBy: actor.userId,
        },
      });
      await recordAudit(tx, {
        workspaceId: actor.workspaceId,
        actorUserId: actor.userId,
        action: "delivery_note.deleted",
        entityType: "delivery_note",
        entityId: id,
        before: snapshotRow(before),
        occurredAt: now,
      });
    });
    await removeFromGallery(this.media, {
      workspaceId: actor.workspaceId,
      projectId: current.projectId,
      source: "delivery_note",
      sourceId: id,
      now,
    });
  }

  async approve(
    actor: ProcurementCommandActor,
    ids: readonly string[],
  ): Promise<void> {
    const now = new Date();
    const events: DomainEvent[] = [];
    await this.db.$transaction(async (tx) => {
      const rows = await tx.constructionProcurementDeliveryNote.findMany({
        where: {
          workspaceId: actor.workspaceId,
          id: { in: [...ids] },
          deletedAt: null,
        },
        select: { id: true, approvalStatus: true, deliveredAt: true },
      });
      const found = new Map(rows.map((row) => [row.id, row]));
      const refusals: BulkRefusal[] = [];
      for (const id of ids) {
        const row = found.get(id);
        if (row == null)
          refusals.push({
            id,
            code: "DELIVERY_NOTE_NOT_FOUND",
            message: "This Delivery Note was not found.",
          });
        else if (row.approvalStatus !== "pending")
          refusals.push({
            id,
            code: "DELIVERY_NOTE_NOT_PENDING",
            message: "This Delivery Note is not pending.",
          });
      }
      if (refusals.length > 0) {
        if (ids.length === 1 && refusals[0] != null) {
          const [only] = refusals;
          if (only.code === "DELIVERY_NOTE_NOT_FOUND")
            throw deliveryNoteNotFound();
          const row = found.get(only.id);
          assertDeliveryNotePending(
            row == null ? "pending" : deliveryNoteStatus(row),
          );
        }
        throw bulkRefused(refusals);
      }
      for (const id of [...ids].sort())
        events.push(...(await this.approveOne(tx, actor, id, now)));
    });
    await this.events.dispatch(events);
  }

  async markDelivered(
    actor: ProcurementCommandActor,
    id: string,
    deliveredOn: CalendarDate,
    expectedUpdatedAt: Date,
  ): Promise<DeliveryNoteReadModel> {
    await assertNotFuture(
      this.db,
      actor.workspaceId,
      deliveredOn,
      "deliveredOn",
    );
    const backdated = await loadBackdatedCheck(this.db, actor);
    backdated(DOC.backdated, "create", deliveredOn);
    const now = new Date();
    const events: DomainEvent[] = [];
    const current = await this.find(actor.workspaceId, id);
    if (current == null) throw deliveryNoteNotFound();
    const result = await this.db.$transaction(async (tx) => {
      const request = await this.requests.lock(
        tx,
        actor.workspaceId,
        current.materialRequestId,
      );
      const before = await this.lock(tx, actor.workspaceId, id);
      if (before.updatedAt.getTime() !== expectedUpdatedAt.getTime())
        throw changed("DELIVERY_NOTE_CHANGED", DOC.naming.label);
      assertDeliverable(
        deliveryNoteStatus(before),
        calendarDateFromDb(before.deliveryDate),
        deliveredOn,
      );
      const store = await tx.constructionProcurementStore.findFirst({
        where: { id: before.storeId, workspaceId: actor.workspaceId },
        select: { name: true },
      });
      const postings: StockPosting[] = before.items.map((item) => ({
        location: { kind: "project", id: before.projectId },
        materialId: item.materialId,
        entryDate: deliveredOn,
        type: "received_from_store",
        quantity: item.quantity.toFixed(3),
        source: { type: "delivery_note", id },
        sourceLineId: item.id,
        counterpartyLabel: `From ${store?.name ?? "Central Store"}`,
        siteLocation: (request.siteLocation as LocationRef | null) ?? null,
      }));
      const posted = await this.ledger.post(
        tx,
        { workspaceId: actor.workspaceId, by: actor.userId },
        postings,
        { materialNames: names(before) },
      );
      events.push(...posted.events);
      await tx.constructionProcurementDeliveryNote.update({
        where: { id },
        data: {
          deliveredOn: calendarDateToDb(deliveredOn),
          deliveredAt: now,
          deliveredBy: actor.userId,
          updatedAt: now,
          updatedBy: actor.userId,
        },
      });
      // Only delivered quantities count towards the request (CM-0015 §4).
      const added = new Map<string, Quantity>();
      for (const item of before.items)
        added.set(
          item.materialRequestItemId,
          (added.get(item.materialRequestItemId) ?? Quantity.zero("unit")).add(
            Quantity.of(item.quantity.toFixed(3), "unit"),
          ),
        );
      const items = request.items.map((item) => {
        const delivered = Quantity.of(item.deliveredQty.toFixed(3), "unit").add(
          added.get(item.id) ?? Quantity.zero("unit"),
        );
        return {
          id: item.id,
          askQty: item.askQty.toFixed(3),
          deliveredQty: delivered.toDecimalString(),
        };
      });
      for (const item of items)
        if (added.has(item.id))
          await tx.constructionProcurementMaterialRequestItem.update({
            where: { id: item.id },
            data: { deliveredQty: new Prisma.Decimal(item.deliveredQty) },
          });
      const status = deriveMaterialRequestStatus(
        items,
        request.status === "closed",
      );
      if (status !== request.status)
        await tx.constructionProcurementMaterialRequest.update({
          where: { id: request.id },
          data: { status, updatedAt: now, updatedBy: actor.userId },
        });
      await recordAudit(tx, {
        workspaceId: actor.workspaceId,
        actorUserId: actor.userId,
        action: "delivery_note.delivered",
        entityType: "delivery_note",
        entityId: id,
        after: { deliveredOn, materialRequestStatus: status },
        occurredAt: now,
      });
      return this.mustLoad(tx, actor.workspaceId, id);
    });
    await this.events.dispatch(events);
    return result;
  }

  /** Approve = dispatch: Issued at the store on the note's date (CM-0015 §4). */
  private async approveOne(
    tx: Tx,
    actor: ProcurementCommandActor,
    id: string,
    now: Date,
  ): Promise<DomainEvent[]> {
    const note = await this.lock(tx, actor.workspaceId, id);
    assertDeliveryNotePending(deliveryNoteStatus(note));
    const project = (
      await this.directory.projects(tx, actor.workspaceId, [note.projectId])
    ).get(note.projectId);
    const entryDate = calendarDateFromDb(note.deliveryDate);
    const posted = await this.ledger.post(
      tx,
      { workspaceId: actor.workspaceId, by: actor.userId },
      note.items.map((item) => ({
        location: { kind: "store", id: note.storeId },
        materialId: item.materialId,
        entryDate,
        type: "issued",
        quantity: item.quantity.toFixed(3),
        source: { type: "delivery_note", id },
        sourceLineId: item.id,
        counterpartyLabel: `To ${project?.name ?? "Project"}`,
      })),
      { materialNames: names(note) },
    );
    await tx.constructionProcurementDeliveryNote.update({
      where: { id },
      data: {
        approvalStatus: "approved",
        decidedAt: now,
        decidedBy: actor.userId,
        updatedAt: now,
        updatedBy: actor.userId,
      },
    });
    await recordAudit(tx, {
      workspaceId: actor.workspaceId,
      actorUserId: actor.userId,
      action: "delivery_note.approved",
      entityType: "delivery_note",
      entityId: id,
      before: { approvalStatus: "pending" },
      after: { approvalStatus: "approved" },
      occurredAt: now,
    });
    return [
      ...posted.events,
      {
        type: "document.approved",
        workspaceId: actor.workspaceId,
        occurredAt: now,
        documentType: "delivery_note",
        documentId: id,
        projectId: note.projectId,
        approvedBy: actor.userId,
      } as DomainEvent,
    ];
  }

  /**
   * Lines checked against the locked request: each ≤ what it still waits
   * for (live undelivered notes count as taken; `exceptNoteId` is the one
   * being edited) and ≤ the store's stock on the note's date and now.
   */
  private async checkLines(
    tx: Tx,
    workspaceId: string,
    request: Awaited<ReturnType<PrismaMaterialRequestRepository["lock"]>>,
    draft: DeliveryNoteDraft,
    exceptNoteId: string | null,
  ) {
    const inFlight = await inFlightByItem(tx, [request.id], exceptNoteId);
    const materialIds = request.items.map((item) => item.materialId);
    const store = { kind: "store" as const, id: request.storeId };
    const [onDate, now] = await Promise.all([
      this.ledger.stock(
        tx,
        workspaceId,
        store,
        materialIds,
        draft.deliveryDate,
      ),
      this.ledger.stock(tx, workspaceId, store, materialIds),
    ]);
    const available = new Map<string, RequestLineAvailability>();
    for (const item of request.items) {
      const a = Quantity.of(onDate.get(item.materialId) ?? "0", "unit");
      const b = Quantity.of(now.get(item.materialId) ?? "0", "unit");
      const lower = a.compare(b) <= 0 ? a : b;
      available.set(item.id, {
        id: item.id,
        materialId: item.materialId,
        materialName: item.materialName,
        pendingQty: pendingQuantity(
          item.askQty.toFixed(3),
          item.deliveredQty.toFixed(3),
          inFlight.get(item.id) ?? "0",
        ),
        storeStock: lower.isNegative() ? "0.000" : lower.toDecimalString(),
      });
    }
    const lines = deliveryNoteLines(draft.items, available);
    const byId = new Map(request.items.map((item) => [item.id, item]));
    return lines.map((line, index) => {
      const item = byId.get(line.materialRequestItemId);
      if (item == null) throw new Error("Request line vanished.");
      return {
        id: newId(),
        materialRequestItemId: item.id,
        position: index + 1,
        materialId: item.materialId,
        materialName: item.materialName,
        uomId: item.uomId,
        uomName: item.uomName,
        quantity: new Prisma.Decimal(line.quantity),
      };
    });
  }

  private async lock(tx: Tx, workspaceId: string, id: string): Promise<Row> {
    const locked = await tx.$queryRaw<{ id: string }[]>`
      SELECT id::text FROM "construction_procurement"."delivery_notes"
      WHERE id = ${id}::uuid AND workspace_id = ${workspaceId} AND deleted_at IS NULL
      FOR UPDATE`;
    if (locked.length === 0) throw deliveryNoteNotFound();
    const row = await tx.constructionProcurementDeliveryNote.findFirst({
      where: { id, workspaceId, deletedAt: null },
      include,
    });
    if (row == null) throw deliveryNoteNotFound();
    return row;
  }

  private async mustLoad(tx: Tx, workspaceId: string, id: string) {
    const row = await tx.constructionProcurementDeliveryNote.findFirst({
      where: { id, workspaceId, deletedAt: null },
      include,
    });
    if (row == null) throw deliveryNoteNotFound();
    const [model] = await this.readModels(tx, workspaceId, [row]);
    if (model == null) throw deliveryNoteNotFound();
    return model;
  }

  private async readModels(
    db: Tx | PrismaClient,
    workspaceId: string,
    rows: readonly Row[],
  ): Promise<DeliveryNoteReadModel[]> {
    if (rows.length === 0) return [];
    const tx = db;
    const [projects, stores, inFlight] = await Promise.all([
      this.directory.projects(tx, workspaceId, [
        ...new Set(rows.map((row) => row.projectId)),
      ]),
      db.constructionProcurementStore.findMany({
        where: {
          workspaceId,
          id: { in: [...new Set(rows.map((row) => row.storeId))] },
        },
        select: { id: true, name: true },
      }),
      inFlightByItem(db, [
        ...new Set(rows.map((row) => row.materialRequestId)),
      ]),
    ]);
    const storeNames = new Map(stores.map((store) => [store.id, store.name]));
    return rows.map((row) => {
      const requestItems = new Map(
        row.materialRequest.items.map((item) => [item.id, item]),
      );
      const status = deliveryNoteStatus(row);
      return {
        id: row.id,
        number: row.number,
        materialRequestId: row.materialRequestId,
        materialRequestNumber: row.materialRequest.number,
        storeId: row.storeId,
        storeName: storeNames.get(row.storeId) ?? null,
        projectId: row.projectId,
        projectName: projects.get(row.projectId)?.name ?? null,
        deliveryDate: calendarDateFromDb(row.deliveryDate),
        deliveredTo: row.deliveredTo,
        remark: row.remark,
        status,
        decidedAt: row.decidedAt,
        decidedBy: row.decidedBy,
        deliveredOn:
          row.deliveredOn == null ? null : calendarDateFromDb(row.deliveredOn),
        deliveredAt: row.deliveredAt,
        deliveredBy: row.deliveredBy,
        items: row.items.map((item) => {
          const requestItem = requestItems.get(item.materialRequestItemId);
          const askQty = requestItem?.askQty.toFixed(3) ?? "0.000";
          const delivered = requestItem?.deliveredQty.toFixed(3) ?? "0.000";
          // This note left out: what it holds while undelivered is in flight.
          let held = Quantity.of(
            inFlight.get(item.materialRequestItemId) ?? "0",
            "unit",
          );
          if (status !== "delivered")
            held = held.subtract(Quantity.of(item.quantity.toFixed(3), "unit"));
          const deliveredOthers =
            status === "delivered"
              ? Quantity.of(delivered, "unit")
                  .subtract(Quantity.of(item.quantity.toFixed(3), "unit"))
                  .toDecimalString()
              : delivered;
          return {
            id: item.id,
            materialRequestItemId: item.materialRequestItemId,
            position: item.position,
            materialId: item.materialId,
            materialName: item.materialName,
            uomName: item.uomName,
            quantity: item.quantity.toFixed(3),
            requestedQty: askQty,
            pendingQty: pendingQuantity(
              askQty,
              deliveredOthers,
              held.isNegative() ? "0" : held.toDecimalString(),
            ),
          };
        }),
        createdAt: row.createdAt,
        createdBy: row.createdBy,
        updatedAt: row.updatedAt,
      };
    });
  }
}

function names(row: Row): Map<string, string> {
  return new Map(row.items.map((item) => [item.materialId, item.materialName]));
}

function snapshotDraft(draft: DeliveryNoteDraft) {
  return {
    deliveryDate: draft.deliveryDate,
    deliveredTo: draft.deliveredTo,
    remark: draft.remark,
    items: draft.items,
  };
}

function snapshotRow(row: Row) {
  return {
    number: row.number,
    deliveryDate: calendarDateFromDb(row.deliveryDate),
    deliveredTo: row.deliveredTo,
    remark: row.remark,
    items: row.items.map((item) => ({
      materialRequestItemId: item.materialRequestItemId,
      quantity: item.quantity.toFixed(3),
    })),
  };
}
