import { Prisma, type PrismaClient } from "@repo/construction-db";

import type { Flag } from "@/src/shared-kernel/access";
import type { DocumentApproved } from "@/src/shared-kernel/approval";
import {
  approvedState,
  optionalText,
  requiredText,
} from "@/src/shared-kernel/approval";
import { recordAudit } from "@/src/shared-kernel/audit";
import {
  calendarDateFromDb,
  calendarDateToDb,
  type CalendarDate,
} from "@/src/shared-kernel/calendar-date";
import { companyToday } from "@/src/shared-kernel/company-today";
import {
  conflict,
  DomainError,
  forbidden,
  notFound,
} from "@/src/shared-kernel/domain-error";
import type { DomainEvent, EventDispatcher } from "@/src/shared-kernel/events";
import { newId } from "@/src/shared-kernel/ids";
import type { ListCursor } from "@/src/shared-kernel/list-cursor";
import { nextSequenceNumber } from "@/src/shared-kernel/sequence/next-sequence-number";

import { canOnTransferSide } from "../application/inventory-access";
import type { MaterialFacts, ProcurementDirectory } from "../application/ports";
import {
  assertDeliverable,
  assertTransferDate,
  assertTransferPending,
  assertTransferRoute,
  receiverName as cleanReceiverName,
  TRANSFER_NAMING,
  transferLines,
  transferStatus,
  transferType,
  type TransferLineInput,
  type TransferStatus,
  type TransferType,
} from "../domain/material-transfer";
import type { StockPosting } from "../domain/stock-ledger";
import {
  stockLocationKey,
  type StockLocation,
} from "../domain/stock-location";
import {
  requireStockLocation,
  stockLocationNames,
  userNames,
  type NamedStockLocation,
} from "./inventory-locations";
import { loadBackdatedCheck } from "./procurement-guards";
import { stockLedger } from "./stock-ledger-instance";
import type { InventoryCaller } from "./stock-movement-store";

type Tx = Prisma.TransactionClient;

type TransferRow = Prisma.ConstructionProcurementMaterialTransferGetPayload<{
  include: { items: true };
}>;

export type Person = { userId: string; name: string | null };

export type MaterialTransferLine = {
  id: string;
  position: number;
  materialId: string;
  materialName: string;
  uomId: string;
  uomName: string;
  quantity: string;
  remark: string | null;
};

export type MaterialTransfer = {
  id: string;
  number: string;
  transferDate: CalendarDate;
  type: TransferType;
  from: NamedStockLocation;
  to: NamedStockLocation;
  receiverName: string | null;
  remark: string | null;
  status: TransferStatus;
  approvalStatus: "pending" | "approved" | "rejected";
  decidedAt: Date | null;
  decidedBy: Person | null;
  rejectionReason: string | null;
  deliveredOn: CalendarDate | null;
  deliveredAt: Date | null;
  deliveredBy: Person | null;
  createdBy: Person;
  createdAt: Date;
  updatedAt: Date;
  lines: MaterialTransferLine[];
};

export type TransferDirection = "in" | "out";

export type TransferListParams = {
  location: StockLocation;
  direction?: TransferDirection;
  status?: TransferStatus;
  from?: CalendarDate;
  to?: CalendarDate;
  limit: number;
  after?: ListCursor;
  before?: ListCursor;
};

export type TransferListPage = {
  items: MaterialTransfer[];
  hasMore: boolean;
  total: number;
};

export type TransferInput = {
  transferDate: CalendarDate;
  from: StockLocation;
  to: StockLocation;
  lines: readonly TransferLineInput[];
  receiverName?: string | null;
  remark?: string | null;
};

function permissionDenied(): DomainError {
  return forbidden(
    "PERMISSION_DENIED",
    "You do not have permission to do this. Ask the Owner to change your Permission Matrix.",
  );
}

function changed(): DomainError {
  return conflict(
    `${TRANSFER_NAMING.code}_CHANGED`,
    `Someone changed this ${TRANSFER_NAMING.label}. Reload it and try again.`,
  );
}

function statusFilter(status: TransferStatus): Prisma.ConstructionProcurementMaterialTransferWhereInput {
  switch (status) {
    case "pending":
      return { approvalStatus: "pending" };
    case "rejected":
      return { approvalStatus: "rejected" };
    case "in_transit":
      return { approvalStatus: "approved", deliveredOn: null };
    case "delivered":
      return { approvalStatus: "approved", deliveredOn: { not: null } };
  }
}

function snapshot(transfer: MaterialTransfer) {
  return {
    number: transfer.number,
    transferDate: transfer.transferDate,
    from: { kind: transfer.from.kind, id: transfer.from.id },
    to: { kind: transfer.to.kind, id: transfer.to.id },
    receiverName: transfer.receiverName,
    remark: transfer.remark,
    status: transfer.status,
    lines: transfer.lines.map((line) => ({
      materialId: line.materialId,
      quantity: line.quantity,
      remark: line.remark,
    })),
  };
}

/**
 * Material Transfers (CM-507, ADR CM-0015 §4) in
 * `construction_procurement.material_transfers`. Create, edit and delete
 * while pending; Approve posts Transferred out at the source; Reject moves
 * nothing; Mark as Delivered posts Transferred in at the destination.
 * Flags are checked on the source for create, edit, delete, approve and
 * reject, and on the destination for Mark as Delivered
 * (`canOnTransferSide`).
 */
export class MaterialTransferCommands {
  constructor(
    private readonly deps: {
      db: PrismaClient;
      directory: ProcurementDirectory;
      dispatcher: EventDispatcher;
    },
  ) {}

  private get db() {
    return this.deps.db;
  }

  private assertSide(
    caller: InventoryCaller,
    side: StockLocation,
    flag: Flag,
  ): void {
    if (!canOnTransferSide(caller.access, side, flag)) throw permissionDenied();
  }

  /** Whether the caller may read the transfer: Read on either side. */
  private canRead(caller: InventoryCaller, transfer: MaterialTransfer): boolean {
    return (
      canOnTransferSide(caller.access, transfer.from, "read") ||
      canOnTransferSide(caller.access, transfer.to, "read")
    );
  }

  private async toTransfers(
    db: Tx,
    workspaceId: string,
    rows: readonly TransferRow[],
  ): Promise<MaterialTransfer[]> {
    const locations = rows.flatMap((row) => [
      { kind: row.fromKind, id: row.fromId },
      { kind: row.toKind, id: row.toId },
    ]);
    const [names, people] = await Promise.all([
      stockLocationNames(db, this.deps.directory, workspaceId, locations),
      userNames(
        db,
        workspaceId,
        rows.flatMap((row) =>
          [row.createdBy, row.decidedBy, row.deliveredBy].filter(
            (id): id is string => id != null,
          ),
        ),
      ),
    ]);
    const person = (userId: string | null): Person | null =>
      userId == null ? null : { userId, name: people.get(userId) ?? null };
    const named = (kind: "project" | "store", id: string): NamedStockLocation => ({
      kind,
      id,
      name:
        names.get(stockLocationKey({ kind, id })) ??
        (kind === "project" ? "Deleted Project" : "Deleted Store"),
    });
    return rows.map((row) => {
      const from = named(row.fromKind, row.fromId);
      const to = named(row.toKind, row.toId);
      const deliveredOn =
        row.deliveredOn == null ? null : calendarDateFromDb(row.deliveredOn);
      return {
        id: row.id,
        number: row.number,
        transferDate: calendarDateFromDb(row.transferDate),
        type: transferType(from, to),
        from,
        to,
        receiverName: row.receiverName,
        remark: row.remark,
        status: transferStatus({
          approvalStatus: row.approvalStatus,
          deliveredOn,
        }),
        approvalStatus: row.approvalStatus,
        decidedAt: row.decidedAt,
        decidedBy: person(row.decidedBy),
        rejectionReason: row.rejectionReason,
        deliveredOn,
        deliveredAt: row.deliveredAt,
        deliveredBy: person(row.deliveredBy),
        createdBy: person(row.createdBy) ?? { userId: row.createdBy, name: null },
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        lines: [...row.items]
          .sort((a, b) => a.position - b.position)
          .map((item) => ({
            id: item.id,
            position: item.position,
            materialId: item.materialId,
            materialName: item.materialName,
            uomId: item.uomId,
            uomName: item.uomName,
            quantity: item.quantity.toFixed(3),
            remark: item.remark,
          })),
      };
    });
  }

  private async loadRow(db: Tx, workspaceId: string, id: string) {
    const row = await db.constructionProcurementMaterialTransfer.findFirst({
      where: { id, workspaceId, deletedAt: null },
      include: { items: true },
    });
    if (row == null)
      throw notFound(
        `${TRANSFER_NAMING.code}_NOT_FOUND`,
        `This ${TRANSFER_NAMING.label} was not found.`,
      );
    return row;
  }

  private async load(
    db: Tx,
    workspaceId: string,
    id: string,
  ): Promise<MaterialTransfer> {
    const [transfer] = await this.toTransfers(db, workspaceId, [
      await this.loadRow(db, workspaceId, id),
    ]);
    if (transfer == null) throw new Error("unreachable");
    return transfer;
  }

  /** One live transfer the caller may read (Read on either side). */
  async get(caller: InventoryCaller, id: string): Promise<MaterialTransfer> {
    const transfer = await this.load(this.db, caller.actor.workspaceId, id);
    if (!this.canRead(caller, transfer)) throw permissionDenied();
    return transfer;
  }

  /**
   * Transfers into and out of a location, newest recorded first. Needs
   * Read on that side.
   */
  async list(
    caller: InventoryCaller,
    params: TransferListParams,
  ): Promise<TransferListPage> {
    const { workspaceId } = caller.actor;
    const { location } = params;
    await requireStockLocation(this.db, this.deps.directory, workspaceId, location);
    this.assertSide(caller, location, "read");
    const into = { toKind: location.kind, toId: location.id };
    const outOf = { fromKind: location.kind, fromId: location.id };
    const filters: Prisma.ConstructionProcurementMaterialTransferWhereInput[] = [
      { workspaceId, deletedAt: null },
      params.direction === "in"
        ? into
        : params.direction === "out"
          ? outOf
          : { OR: [into, outOf] },
    ];
    if (params.status != null) filters.push(statusFilter(params.status));
    if (params.from != null)
      filters.push({ transferDate: { gte: calendarDateToDb(params.from) } });
    if (params.to != null)
      filters.push({ transferDate: { lte: calendarDateToDb(params.to) } });
    const backwards = params.before != null;
    const cursor = params.after ?? params.before;
    const where: Prisma.ConstructionProcurementMaterialTransferWhereInput = {
      AND:
        cursor == null
          ? filters
          : [
              ...filters,
              {
                OR: backwards
                  ? [
                      { createdAt: { gt: cursor.createdAt } },
                      { createdAt: cursor.createdAt, id: { gt: cursor.id } },
                    ]
                  : [
                      { createdAt: { lt: cursor.createdAt } },
                      { createdAt: cursor.createdAt, id: { lt: cursor.id } },
                    ],
              },
            ],
    };
    const [page, total] = await Promise.all([
      this.db.constructionProcurementMaterialTransfer.findMany({
        where,
        include: { items: true },
        orderBy: backwards
          ? [{ createdAt: "asc" }, { id: "asc" }]
          : [{ createdAt: "desc" }, { id: "desc" }],
        take: params.limit + 1,
      }),
      this.db.constructionProcurementMaterialTransfer.count({
        where: { AND: filters },
      }),
    ]);
    const hasMore = page.length > params.limit;
    const rows = page.slice(0, params.limit);
    if (backwards) rows.reverse();
    return {
      items: await this.toTransfers(this.db, workspaceId, rows),
      hasMore,
      total,
    };
  }

  /** Stock at the source for the form's "Available" column (create on the source). */
  async availableStock(
    caller: InventoryCaller,
    from: StockLocation,
    materialIds: readonly string[],
    on?: CalendarDate,
  ): Promise<Map<string, string>> {
    const { workspaceId } = caller.actor;
    await requireStockLocation(this.db, this.deps.directory, workspaceId, from);
    if (
      !canOnTransferSide(caller.access, from, "create") &&
      !canOnTransferSide(caller.access, from, "update")
    )
      throw permissionDenied();
    const stock = await stockLedger().stock(
      this.db,
      workspaceId,
      from,
      materialIds,
      on,
    );
    return new Map(
      materialIds.map((id) => [id, new Prisma.Decimal(stock.get(id) ?? 0).toFixed(3)]),
    );
  }

  /** Checks a form: places, lines, materials, dates, back-dated create. */
  private async prepare(caller: InventoryCaller, input: TransferInput) {
    const { workspaceId } = caller.actor;
    assertTransferRoute(input.from, input.to);
    const [from, to] = await Promise.all([
      requireStockLocation(this.db, this.deps.directory, workspaceId, input.from, 400),
      requireStockLocation(this.db, this.deps.directory, workspaceId, input.to, 400),
    ]);
    const lines = transferLines(input.lines);
    const materials = await this.deps.directory.materials(
      this.db,
      workspaceId,
      lines.map((line) => line.materialId),
    );
    lines.forEach((line, index) => {
      const material = materials.get(line.materialId);
      if (material == null || material.disabled)
        throw new DomainError(
          "MATERIAL_NOT_FOUND",
          "This material was not found in Masters.",
          {
            details: {
              field: `lines.${String(index)}.materialId`,
              ids: [line.materialId],
            },
          },
        );
    });
    const today = await companyToday(this.db, workspaceId);
    assertTransferDate(input.transferDate, today);
    return {
      from,
      to,
      lines,
      materials,
      receiverName: cleanReceiverName(input.receiverName),
      remark: optionalText(input.remark, "remark"),
    };
  }

  private itemRows(
    transferId: string,
    lines: ReturnType<typeof transferLines>,
    materials: ReadonlyMap<string, MaterialFacts>,
  ) {
    return lines.map((line, index) => {
      const material = materials.get(line.materialId);
      if (material == null) throw new Error("material checked in prepare");
      return {
        id: newId(),
        materialTransferId: transferId,
        position: index + 1,
        materialId: line.materialId,
        materialName: material.name,
        uomId: material.uomId,
        uomName: material.uomName,
        quantity: new Prisma.Decimal(line.quantity),
        remark: line.remark,
      };
    });
  }

  /** Transferred out at the source, one entry per line, on the transfer date. */
  private async dispatchStock(
    tx: Tx,
    workspaceId: string,
    by: string,
    transfer: {
      id: string;
      transferDate: CalendarDate;
      from: NamedStockLocation;
      to: NamedStockLocation;
      lines: readonly { id: string; materialId: string; materialName: string; quantity: string }[];
    },
  ): Promise<DomainEvent[]> {
    const written = await stockLedger().post(
      tx,
      { workspaceId, by },
      transfer.lines.map(
        (line): StockPosting => ({
          location: transfer.from,
          materialId: line.materialId,
          entryDate: transfer.transferDate,
          type: "transferred_out",
          quantity: line.quantity,
          source: { type: "material_transfer", id: transfer.id },
          sourceLineId: line.id,
          counterpartyLabel: `To ${transfer.to.name}`,
        }),
      ),
      {
        materialNames: new Map(
          transfer.lines.map((line) => [line.materialId, line.materialName]),
        ),
      },
    );
    return written.events;
  }

  private approvedEvent(
    workspaceId: string,
    transfer: { id: string; from: StockLocation },
    by: string,
  ): DocumentApproved {
    return {
      type: "document.approved",
      workspaceId,
      occurredAt: new Date(),
      documentType: "material_transfer",
      documentId: transfer.id,
      projectId: transfer.from.kind === "project" ? transfer.from.id : null,
      approvedBy: by,
    };
  }

  private async dispatch(events: readonly DomainEvent[]): Promise<void> {
    if (events.length > 0) await this.deps.dispatcher.dispatch(events);
  }

  /** Save (pending) or Save & Approve (`approve`, dispatching at once). */
  async create(
    caller: InventoryCaller,
    input: TransferInput & { approve?: boolean },
  ): Promise<MaterialTransfer> {
    const { actor } = caller;
    const { workspaceId } = actor;
    this.assertSide(caller, input.from, "create");
    if (input.approve === true) this.assertSide(caller, input.from, "approve");
    const form = await this.prepare(caller, input);
    const check = await loadBackdatedCheck(this.db, actor);
    check("material_transfer", "create", input.transferDate);
    const id = newId();
    const { transfer, events } = await this.db.$transaction(async (tx) => {
      const now = new Date();
      const { number } = await nextSequenceNumber(tx, {
        workspaceId,
        module: "material_transfer",
        projectId: form.from.kind === "project" ? form.from.id : null,
        date: input.transferDate,
        by: actor.userId,
      });
      const decided =
        input.approve === true
          ? approvedState({ userId: actor.userId, at: now })
          : null;
      const items = this.itemRows(id, form.lines, form.materials);
      await tx.constructionProcurementMaterialTransfer.create({
        data: {
          id,
          workspaceId,
          number,
          transferDate: calendarDateToDb(input.transferDate),
          fromKind: form.from.kind,
          fromId: form.from.id,
          toKind: form.to.kind,
          toId: form.to.id,
          receiverName: form.receiverName,
          remark: form.remark,
          approvalStatus: decided?.status ?? "pending",
          decidedAt: decided?.decidedAt ?? null,
          decidedBy: decided?.decidedBy ?? null,
          createdAt: now,
          updatedAt: now,
          createdBy: actor.userId,
          updatedBy: actor.userId,
          items: {
            createMany: {
              data: items.map(({ materialTransferId: _, ...item }) => item),
            },
          },
        },
      });
      const ledgerEvents =
        decided == null
          ? []
          : await this.dispatchStock(tx, workspaceId, actor.userId, {
              id,
              transferDate: input.transferDate,
              from: form.from,
              to: form.to,
              lines: items.map((item) => ({
                id: item.id,
                materialId: item.materialId,
                materialName: item.materialName,
                quantity: item.quantity.toFixed(3),
              })),
            });
      const created = await this.load(tx, workspaceId, id);
      await recordAudit(tx, {
        workspaceId,
        actorUserId: actor.userId,
        action: "material_transfer.created",
        entityType: "material_transfer",
        entityId: id,
        after: snapshot(created),
      });
      if (decided != null)
        await recordAudit(tx, {
          workspaceId,
          actorUserId: actor.userId,
          action: "material_transfer.approved",
          entityType: "material_transfer",
          entityId: id,
          after: { status: created.status },
        });
      return {
        transfer: created,
        events:
          decided == null
            ? ledgerEvents
            : [
                ...ledgerEvents,
                this.approvedEvent(workspaceId, created, actor.userId),
              ],
      };
    });
    await this.dispatch(events);
    return transfer;
  }

  /** Edit a pending transfer (Update on its source, old and new). */
  async update(
    caller: InventoryCaller,
    id: string,
    input: TransferInput & { expectedUpdatedAt: Date },
  ): Promise<MaterialTransfer> {
    const { actor } = caller;
    const { workspaceId } = actor;
    const before = await this.load(this.db, workspaceId, id);
    this.assertSide(caller, before.from, "update");
    this.assertSide(caller, input.from, "update");
    assertTransferPending(before);
    if (before.updatedAt.getTime() !== input.expectedUpdatedAt.getTime())
      throw changed();
    const form = await this.prepare(caller, input);
    const check = await loadBackdatedCheck(this.db, actor);
    check("material_transfer", "edit", before.transferDate);
    if (input.transferDate !== before.transferDate)
      check("material_transfer", "edit", input.transferDate);
    const transfer = await this.db.$transaction(async (tx) => {
      const updated = await tx.constructionProcurementMaterialTransfer.updateMany({
        where: {
          id,
          workspaceId,
          deletedAt: null,
          approvalStatus: "pending",
          updatedAt: input.expectedUpdatedAt,
        },
        data: {
          transferDate: calendarDateToDb(input.transferDate),
          fromKind: form.from.kind,
          fromId: form.from.id,
          toKind: form.to.kind,
          toId: form.to.id,
          receiverName: form.receiverName,
          remark: form.remark,
          updatedAt: new Date(),
          updatedBy: actor.userId,
        },
      });
      if (updated.count === 0) throw changed();
      await tx.constructionProcurementMaterialTransferItem.deleteMany({
        where: { materialTransferId: id },
      });
      await tx.constructionProcurementMaterialTransferItem.createMany({
        data: this.itemRows(id, form.lines, form.materials),
      });
      const after = await this.load(tx, workspaceId, id);
      await recordAudit(tx, {
        workspaceId,
        actorUserId: actor.userId,
        action: "material_transfer.updated",
        entityType: "material_transfer",
        entityId: id,
        before: snapshot(before),
        after: snapshot(after),
      });
      return after;
    });
    return transfer;
  }

  /** Approve: dispatch, posting Transferred out at the source (Approve on it). */
  async approve(
    caller: InventoryCaller,
    id: string,
    expectedUpdatedAt?: Date,
  ): Promise<MaterialTransfer> {
    const { actor } = caller;
    const { workspaceId } = actor;
    const before = await this.load(this.db, workspaceId, id);
    this.assertSide(caller, before.from, "approve");
    assertTransferPending(before);
    if (
      expectedUpdatedAt != null &&
      before.updatedAt.getTime() !== expectedUpdatedAt.getTime()
    )
      throw changed();
    const { transfer, events } = await this.db.$transaction(async (tx) => {
      const now = new Date();
      const updated = await tx.constructionProcurementMaterialTransfer.updateMany({
        where: {
          id,
          workspaceId,
          deletedAt: null,
          approvalStatus: "pending",
          updatedAt: before.updatedAt,
        },
        data: {
          approvalStatus: "approved",
          decidedAt: now,
          decidedBy: actor.userId,
          updatedAt: now,
          updatedBy: actor.userId,
        },
      });
      if (updated.count === 0) throw changed();
      const ledgerEvents = await this.dispatchStock(tx, workspaceId, actor.userId, before);
      const after = await this.load(tx, workspaceId, id);
      await recordAudit(tx, {
        workspaceId,
        actorUserId: actor.userId,
        action: "material_transfer.approved",
        entityType: "material_transfer",
        entityId: id,
        before: { status: before.status },
        after: { status: after.status },
      });
      return {
        transfer: after,
        events: [
          ...ledgerEvents,
          this.approvedEvent(workspaceId, after, actor.userId),
        ],
      };
    });
    await this.dispatch(events);
    return transfer;
  }

  /** Reject with a reason (Reject on the source); nothing moves. */
  async reject(
    caller: InventoryCaller,
    id: string,
    reason: string,
  ): Promise<MaterialTransfer> {
    const { actor } = caller;
    const { workspaceId } = actor;
    const before = await this.load(this.db, workspaceId, id);
    this.assertSide(caller, before.from, "reject");
    assertTransferPending(before);
    const text = requiredText(reason, "REJECTION_REASON_REQUIRED", "reason");
    return this.db.$transaction(async (tx) => {
      const now = new Date();
      const updated = await tx.constructionProcurementMaterialTransfer.updateMany({
        where: { id, workspaceId, deletedAt: null, approvalStatus: "pending" },
        data: {
          approvalStatus: "rejected",
          decidedAt: now,
          decidedBy: actor.userId,
          rejectionReason: text,
          updatedAt: now,
          updatedBy: actor.userId,
        },
      });
      if (updated.count === 0) throw changed();
      const after = await this.load(tx, workspaceId, id);
      await recordAudit(tx, {
        workspaceId,
        actorUserId: actor.userId,
        action: "material_transfer.rejected",
        entityType: "material_transfer",
        entityId: id,
        before: { status: before.status },
        after: { status: after.status, reason: text },
      });
      return after;
    });
  }

  /**
   * Mark as Delivered (Update on the destination): Transferred in at the
   * destination on the delivery date, recording who.
   */
  async deliver(
    caller: InventoryCaller,
    id: string,
    deliveredOn: CalendarDate,
  ): Promise<MaterialTransfer> {
    const { actor } = caller;
    const { workspaceId } = actor;
    const before = await this.load(this.db, workspaceId, id);
    this.assertSide(caller, before.to, "update");
    const today = await companyToday(this.db, workspaceId);
    assertDeliverable(before, before.transferDate, deliveredOn, today);
    const check = await loadBackdatedCheck(this.db, actor);
    check("material_transfer", "create", deliveredOn);
    const { transfer, events } = await this.db.$transaction(async (tx) => {
      const now = new Date();
      const updated = await tx.constructionProcurementMaterialTransfer.updateMany({
        where: {
          id,
          workspaceId,
          deletedAt: null,
          approvalStatus: "approved",
          deliveredOn: null,
        },
        data: {
          deliveredOn: calendarDateToDb(deliveredOn),
          deliveredAt: now,
          deliveredBy: actor.userId,
          updatedAt: now,
          updatedBy: actor.userId,
        },
      });
      if (updated.count === 0) throw changed();
      const written = await stockLedger().post(
        tx,
        { workspaceId, by: actor.userId },
        before.lines.map(
          (line): StockPosting => ({
            location: before.to,
            materialId: line.materialId,
            entryDate: deliveredOn,
            type: "transferred_in",
            quantity: line.quantity,
            source: { type: "material_transfer", id },
            sourceLineId: line.id,
            counterpartyLabel: `From ${before.from.name}`,
          }),
        ),
      );
      const after = await this.load(tx, workspaceId, id);
      await recordAudit(tx, {
        workspaceId,
        actorUserId: actor.userId,
        action: "material_transfer.delivered",
        entityType: "material_transfer",
        entityId: id,
        before: { status: before.status },
        after: { status: after.status, deliveredOn },
      });
      return { transfer: after, events: written.events };
    });
    await this.dispatch(events);
    return transfer;
  }

  /** Delete a pending transfer (Delete on the source); the number is not reused. */
  async remove(
    caller: InventoryCaller,
    id: string,
    expectedUpdatedAt: Date,
  ): Promise<void> {
    const { actor } = caller;
    const { workspaceId } = actor;
    const before = await this.load(this.db, workspaceId, id);
    this.assertSide(caller, before.from, "delete");
    assertTransferPending(before);
    if (before.updatedAt.getTime() !== expectedUpdatedAt.getTime())
      throw changed();
    const check = await loadBackdatedCheck(this.db, actor);
    check("material_transfer", "edit", before.transferDate);
    await this.db.$transaction(async (tx) => {
      const now = new Date();
      const updated = await tx.constructionProcurementMaterialTransfer.updateMany({
        where: {
          id,
          workspaceId,
          deletedAt: null,
          approvalStatus: "pending",
          updatedAt: expectedUpdatedAt,
        },
        data: { deletedAt: now, deletedBy: actor.userId },
      });
      if (updated.count === 0) throw changed();
      await recordAudit(tx, {
        workspaceId,
        actorUserId: actor.userId,
        action: "material_transfer.deleted",
        entityType: "material_transfer",
        entityId: id,
        before: snapshot(before),
      });
    });
  }
}
