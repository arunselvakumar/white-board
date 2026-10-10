import { Prisma, type PrismaClient } from "@repo/construction-db";

import { optionalText } from "@/src/shared-kernel/approval";
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
  notFound,
} from "@/src/shared-kernel/domain-error";
import { newId } from "@/src/shared-kernel/ids";
import {
  locationRef,
  type LocationRef,
  type LocationResolver,
} from "@/src/shared-kernel/location-ref";
import { Quantity } from "@/src/shared-kernel/quantity";
import { nextSequenceNumber } from "@/src/shared-kernel/sequence/next-sequence-number";

import type {
  MaterialRequestDraft,
  MaterialRequestListPage,
  MaterialRequestListParams,
  MaterialRequestReadModel,
  MaterialRequestRepository,
} from "../application/material-request-handlers";
import type { ProcurementDirectory } from "../application/ports";
import type { ProcurementCommandActor } from "../application/store-handlers";
import { deliveryNoteStatus } from "../domain/delivery-note";
import { PROCUREMENT_DOCUMENTS } from "../domain/documents";
import {
  assertMaterialRequestDeletable,
  assertMaterialRequestEditable,
  closeReason,
  pendingQuantity,
} from "../domain/material-request";
import { loadBackdatedCheck } from "./procurement-guards";
import { cursorOrder, cursorWhere } from "./store-repository";

type Tx = Prisma.TransactionClient;

const DOC = PROCUREMENT_DOCUMENTS.material_request;

const include = {
  items: { orderBy: { position: "asc" } },
  deliveryNotes: {
    where: { deletedAt: null },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: {
      id: true,
      number: true,
      deliveryDate: true,
      approvalStatus: true,
      deliveredAt: true,
    },
  },
} satisfies Prisma.ConstructionProcurementMaterialRequestInclude;

type Row = Prisma.ConstructionProcurementMaterialRequestGetPayload<{
  include: typeof include;
}>;

export function materialRequestNotFound(): DomainError {
  return notFound(
    "MATERIAL_REQUEST_NOT_FOUND",
    "This Material Request was not found.",
  );
}

export function changed(code: string, label: string): DomainError {
  return conflict(
    code,
    `Someone changed this ${label} after you opened it. Reload to see the latest.`,
  );
}

/** Refuses a date after the Company's today (400 `DATE_IN_FUTURE`). */
export async function assertNotFuture(
  db: PrismaClient,
  workspaceId: string,
  date: CalendarDate,
  field: string,
): Promise<void> {
  const today = await companyToday(db, workspaceId);
  if (date > today)
    throw new DomainError("DATE_IN_FUTURE", "The date cannot be after today.", {
      details: { field },
    });
}

/**
 * Per request line: quantity held by live Delivery Notes not yet
 * delivered (pending or in transit), as decimal strings.
 */
export async function inFlightByItem(
  db: Tx | PrismaClient,
  materialRequestIds: readonly string[],
  exceptNoteId: string | null = null,
): Promise<Map<string, string>> {
  if (materialRequestIds.length === 0) return new Map();
  const rows = await db.$queryRaw<{ itemId: string; quantity: string }[]>`
    SELECT i.material_request_item_id::text AS "itemId", SUM(i.quantity)::text AS quantity
    FROM "construction_procurement"."delivery_note_items" i
    JOIN "construction_procurement"."delivery_notes" d ON d.id = i.delivery_note_id
    WHERE d.material_request_id = ANY(${[...materialRequestIds]}::uuid[])
      AND d.deleted_at IS NULL AND d.delivered_at IS NULL
      ${exceptNoteId == null ? Prisma.empty : Prisma.sql`AND d.id <> ${exceptNoteId}::uuid`}
    GROUP BY 1`;
  return new Map(rows.map((row) => [row.itemId, row.quantity]));
}

function snapshot(draft: MaterialRequestDraft) {
  return {
    requestDate: draft.requestDate,
    storeId: draft.storeId,
    contractorId: draft.contractorId ?? null,
    departmentId: draft.departmentId ?? null,
    siteLocation: draft.siteLocation ?? null,
    receiverName: draft.receiverName,
    remark: draft.remark ?? null,
    items: draft.items,
  };
}

/** Material Requests in `construction_procurement.material_requests` (CM-508). */
export class PrismaMaterialRequestRepository implements MaterialRequestRepository {
  constructor(
    private readonly db: PrismaClient,
    private readonly directory: ProcurementDirectory,
    private readonly locations: LocationResolver,
  ) {}

  async list(params: MaterialRequestListParams): Promise<MaterialRequestListPage> {
    const where: Prisma.ConstructionProcurementMaterialRequestWhereInput = {
      workspaceId: params.workspaceId,
      deletedAt: null,
    };
    if (params.projectId != null) where.projectId = params.projectId;
    if (params.storeId != null) where.storeId = params.storeId;
    if (params.status != null) where.status = params.status;
    if (params.from != null || params.to != null)
      where.requestDate = {
        ...(params.from == null ? {} : { gte: calendarDateToDb(params.from) }),
        ...(params.to == null ? {} : { lte: calendarDateToDb(params.to) }),
      };
    const search = params.search?.trim() ?? "";
    if (search !== "") where.number = { contains: search, mode: "insensitive" };
    const backwards = params.before != null;
    const cursor = cursorWhere(params.after ?? params.before, backwards);
    const [page, total] = await Promise.all([
      this.db.constructionProcurementMaterialRequest.findMany({
        where: cursor == null ? where : { AND: [where, cursor] },
        include,
        orderBy: cursorOrder(backwards),
        take: params.limit + 1,
      }),
      this.db.constructionProcurementMaterialRequest.count({ where }),
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
    return this.load(this.db, workspaceId, id);
  }

  async create(
    actor: ProcurementCommandActor,
    projectId: string,
    draft: MaterialRequestDraft,
  ): Promise<MaterialRequestReadModel> {
    const site = await this.checkSite(actor.workspaceId, projectId, draft);
    await assertNotFuture(this.db, actor.workspaceId, draft.requestDate, "requestDate");
    const backdated = await loadBackdatedCheck(this.db, actor);
    backdated(DOC.backdated, "create", draft.requestDate);
    const id = newId();
    const now = new Date();
    return this.db.$transaction(async (tx) => {
      const projects = await this.directory.projects(tx, actor.workspaceId, [
        projectId,
      ]);
      if (!projects.has(projectId))
        throw new DomainError("PROJECT_NOT_FOUND", "This Project was not found.", {
          details: { field: "projectId" },
        });
      await this.checkParties(tx, actor.workspaceId, projectId, draft);
      const lines = await this.lines(tx, actor.workspaceId, draft, new Set());
      const { number } = await nextSequenceNumber(tx, {
        workspaceId: actor.workspaceId,
        module: DOC.sequence,
        projectId,
        date: draft.requestDate,
        by: actor.userId,
      });
      await tx.constructionProcurementMaterialRequest.create({
        data: {
          id,
          workspaceId: actor.workspaceId,
          projectId,
          storeId: draft.storeId,
          number,
          requestDate: calendarDateToDb(draft.requestDate),
          contractorId: draft.contractorId ?? null,
          departmentId: draft.departmentId ?? null,
          siteLocationType: site?.type ?? null,
          siteLocation:
            site == null ? Prisma.DbNull : (site as Prisma.InputJsonValue),
          receiverName: draft.receiverName,
          remark: optionalText(draft.remark, "remark"),
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
        action: "material_request.created",
        entityType: "material_request",
        entityId: id,
        after: { number, projectId, ...snapshot(draft) },
        occurredAt: now,
      });
      return this.mustLoad(tx, actor.workspaceId, id);
    });
  }

  async update(
    actor: ProcurementCommandActor,
    id: string,
    draft: MaterialRequestDraft,
    expectedUpdatedAt: Date,
  ): Promise<MaterialRequestReadModel> {
    const current = await this.load(this.db, actor.workspaceId, id);
    if (current == null) throw materialRequestNotFound();
    const site = await this.checkSite(actor.workspaceId, current.projectId, draft);
    await assertNotFuture(this.db, actor.workspaceId, draft.requestDate, "requestDate");
    const backdated = await loadBackdatedCheck(this.db, actor);
    backdated(DOC.backdated, "edit", current.requestDate);
    if (draft.requestDate !== current.requestDate)
      backdated(DOC.backdated, "edit", draft.requestDate);
    const now = new Date();
    return this.db.$transaction(async (tx) => {
      const before = await this.lock(tx, actor.workspaceId, id);
      if (before.updatedAt.getTime() !== expectedUpdatedAt.getTime())
        throw changed("MATERIAL_REQUEST_CHANGED", DOC.naming.label);
      assertMaterialRequestEditable(before.status, before.deliveryNotes.length);
      await this.checkParties(tx, actor.workspaceId, before.projectId, draft);
      const lines = await this.lines(
        tx,
        actor.workspaceId,
        draft,
        new Set(before.items.map((item) => item.materialId)),
      );
      await tx.constructionProcurementMaterialRequestItem.deleteMany({
        where: { materialRequestId: id },
      });
      await tx.constructionProcurementMaterialRequest.update({
        where: { id },
        data: {
          storeId: draft.storeId,
          requestDate: calendarDateToDb(draft.requestDate),
          contractorId: draft.contractorId ?? null,
          departmentId: draft.departmentId ?? null,
          siteLocationType: site?.type ?? null,
          siteLocation:
            site == null ? Prisma.DbNull : (site as Prisma.InputJsonValue),
          receiverName: draft.receiverName,
          remark: optionalText(draft.remark, "remark"),
          updatedAt: now,
          updatedBy: actor.userId,
          items: { create: lines },
        },
      });
      await recordAudit(tx, {
        workspaceId: actor.workspaceId,
        actorUserId: actor.userId,
        action: "material_request.updated",
        entityType: "material_request",
        entityId: id,
        before: rowSnapshot(before),
        after: snapshot(draft),
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
    const current = await this.load(this.db, actor.workspaceId, id);
    if (current == null) throw materialRequestNotFound();
    const backdated = await loadBackdatedCheck(this.db, actor);
    backdated(DOC.backdated, "edit", current.requestDate);
    const now = new Date();
    await this.db.$transaction(async (tx) => {
      const before = await this.lock(tx, actor.workspaceId, id);
      if (before.updatedAt.getTime() !== expectedUpdatedAt.getTime())
        throw changed("MATERIAL_REQUEST_CHANGED", DOC.naming.label);
      assertMaterialRequestDeletable(before.deliveryNotes.length);
      await tx.constructionProcurementMaterialRequest.update({
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
        action: "material_request.deleted",
        entityType: "material_request",
        entityId: id,
        before: rowSnapshot(before),
        occurredAt: now,
      });
    });
  }

  async close(
    actor: ProcurementCommandActor,
    id: string,
    reason: string,
    expectedUpdatedAt: Date,
  ): Promise<MaterialRequestReadModel> {
    const now = new Date();
    return this.db.$transaction(async (tx) => {
      const before = await this.lock(tx, actor.workspaceId, id);
      if (before.updatedAt.getTime() !== expectedUpdatedAt.getTime())
        throw changed("MATERIAL_REQUEST_CHANGED", DOC.naming.label);
      const undelivered = before.deliveryNotes.filter(
        (note) => note.deliveredAt == null,
      ).length;
      const text = closeReason(before.status, undelivered, reason);
      await tx.constructionProcurementMaterialRequest.update({
        where: { id },
        data: {
          status: "closed",
          closedAt: now,
          closedBy: actor.userId,
          closeReason: text,
          updatedAt: now,
          updatedBy: actor.userId,
        },
      });
      await recordAudit(tx, {
        workspaceId: actor.workspaceId,
        actorUserId: actor.userId,
        action: "material_request.closed",
        entityType: "material_request",
        entityId: id,
        before: { status: before.status },
        after: { status: "closed", reason: text },
        occurredAt: now,
      });
      return this.mustLoad(tx, actor.workspaceId, id);
    });
  }

  /** The live request row, locked FOR UPDATE; 404 otherwise. */
  async lock(tx: Tx, workspaceId: string, id: string): Promise<Row> {
    const locked = await tx.$queryRaw<{ id: string }[]>`
      SELECT id::text FROM "construction_procurement"."material_requests"
      WHERE id = ${id}::uuid AND workspace_id = ${workspaceId} AND deleted_at IS NULL
      FOR UPDATE`;
    if (locked.length === 0) throw materialRequestNotFound();
    const row = await tx.constructionProcurementMaterialRequest.findFirst({
      where: { id, workspaceId, deletedAt: null },
      include,
    });
    if (row == null) throw materialRequestNotFound();
    return row;
  }

  async mustLoad(
    db: Tx | PrismaClient,
    workspaceId: string,
    id: string,
  ): Promise<MaterialRequestReadModel> {
    const model = await this.load(db, workspaceId, id);
    if (model == null) throw materialRequestNotFound();
    return model;
  }

  private async load(
    db: Tx | PrismaClient,
    workspaceId: string,
    id: string,
  ): Promise<MaterialRequestReadModel | null> {
    const row = await db.constructionProcurementMaterialRequest.findFirst({
      where: { id, workspaceId, deletedAt: null },
      include,
    });
    if (row == null) return null;
    const [model] = await this.readModels(db, workspaceId, [row]);
    return model ?? null;
  }

  /** Shape and Project check of the site location, outside the transaction. */
  private async checkSite(
    workspaceId: string,
    projectId: string,
    draft: MaterialRequestDraft,
  ): Promise<LocationRef | null> {
    if (draft.siteLocation == null) return null;
    const ref = locationRef(draft.siteLocation);
    await this.locations.assertOnProject(workspaceId, projectId, ref);
    return ref;
  }

  /** Request To, Contractor and Department (400s naming the field). */
  private async checkParties(
    tx: Tx,
    workspaceId: string,
    projectId: string,
    draft: MaterialRequestDraft,
  ): Promise<void> {
    const store = await tx.$queryRaw<{ serves: boolean }[]>`
      SELECT EXISTS (
        SELECT 1 FROM "construction_procurement"."store_projects" p
        WHERE p.store_id = s.id AND p.project_id = ${projectId}::uuid
      ) AS serves
      FROM "construction_procurement"."stores" s
      WHERE s.id = ${draft.storeId}::uuid AND s.workspace_id = ${workspaceId}
        AND s.deleted_at IS NULL
      FOR SHARE OF s`;
    const [found] = store;
    if (found == null)
      throw new DomainError("STORE_NOT_FOUND", "This store was not found.", {
        details: { field: "storeId" },
      });
    if (!found.serves)
      throw new DomainError(
        "STORE_NOT_ON_PROJECT",
        "This store does not serve the Project. Choose a store assigned to it.",
        { details: { field: "storeId" } },
      );
    if (draft.contractorId != null) {
      const contractor = (
        await this.directory.contractors(tx, workspaceId, [draft.contractorId])
      ).get(draft.contractorId);
      if (contractor == null)
        throw new DomainError(
          "CONTRACTOR_NOT_FOUND",
          "This Contractor was not found.",
          { details: { field: "contractorId" } },
        );
      if (!contractor.isActive)
        throw new DomainError(
          "CONTRACTOR_INACTIVE",
          `${contractor.name} is inactive.`,
          { details: { field: "contractorId" } },
        );
      if (!contractor.projectIds.includes(projectId))
        throw new DomainError(
          "CONTRACTOR_NOT_ON_PROJECT",
          `${contractor.name} is not assigned to this Project.`,
          { details: { field: "contractorId" } },
        );
    }
    if (draft.departmentId != null) {
      const department = (
        await this.directory.departments(tx, workspaceId, [draft.departmentId])
      ).get(draft.departmentId);
      if (department == null)
        throw new DomainError(
          "DEPARTMENT_NOT_FOUND",
          "This Department was not found.",
          { details: { field: "departmentId" } },
        );
      if (department.disabled)
        throw new DomainError(
          "DEPARTMENT_DISABLED",
          `${department.name} is disabled.`,
          { details: { field: "departmentId" } },
        );
    }
  }

  /** Lines with the Material's name and unit copied (a disabled one only if already on it). */
  private async lines(
    tx: Tx,
    workspaceId: string,
    draft: MaterialRequestDraft,
    kept: ReadonlySet<string>,
  ) {
    const materials = await this.directory.materials(
      tx,
      workspaceId,
      draft.items.map((item) => item.materialId),
    );
    return draft.items.map((item, index) => {
      const material = materials.get(item.materialId);
      const field = `items.${String(index)}.materialId`;
      if (material == null)
        throw new DomainError("MATERIAL_NOT_FOUND", "This material was not found.", {
          details: { field },
        });
      if (material.disabled && !kept.has(material.id))
        throw new DomainError(
          "MATERIAL_DISABLED",
          `${material.name} is disabled in Masters.`,
          { details: { field } },
        );
      return {
        id: newId(),
        position: index + 1,
        materialId: material.id,
        materialName: material.name,
        uomId: material.uomId,
        uomName: material.uomName,
        askQty: new Prisma.Decimal(item.askQty),
        remark: item.remark,
      };
    });
  }

  private async readModels(
    db: Tx | PrismaClient,
    workspaceId: string,
    rows: readonly Row[],
  ): Promise<MaterialRequestReadModel[]> {
    if (rows.length === 0) return [];
    const tx = db as Tx;
    const projectIds = [...new Set(rows.map((row) => row.projectId))];
    const storeIds = [...new Set(rows.map((row) => row.storeId))];
    const contractorIds = [
      ...new Set(rows.flatMap((row) => (row.contractorId == null ? [] : [row.contractorId]))),
    ];
    const departmentIds = [
      ...new Set(rows.flatMap((row) => (row.departmentId == null ? [] : [row.departmentId]))),
    ];
    const [projects, stores, contractors, departments, inFlight] =
      await Promise.all([
        this.directory.projects(tx, workspaceId, projectIds),
        db.constructionProcurementStore.findMany({
          where: { workspaceId, id: { in: storeIds } },
          select: { id: true, name: true },
        }),
        this.directory.contractors(tx, workspaceId, contractorIds),
        this.directory.departments(tx, workspaceId, departmentIds),
        inFlightByItem(
          db,
          rows.map((row) => row.id),
        ),
      ]);
    const storeNames = new Map(stores.map((store) => [store.id, store.name]));
    return rows.map((row) => {
      const contractor =
        row.contractorId == null ? undefined : contractors.get(row.contractorId);
      const department =
        row.departmentId == null ? undefined : departments.get(row.departmentId);
      return {
        id: row.id,
        number: row.number,
        projectId: row.projectId,
        projectName: projects.get(row.projectId)?.name ?? null,
        storeId: row.storeId,
        storeName: storeNames.get(row.storeId) ?? null,
        requestDate: calendarDateFromDb(row.requestDate),
        contractor:
          contractor == null ? null : { id: contractor.id, name: contractor.name },
        department:
          department == null ? null : { id: department.id, name: department.name },
        siteLocation: (row.siteLocation as LocationRef | null) ?? null,
        receiverName: row.receiverName,
        remark: row.remark,
        status: row.status,
        closedAt: row.closedAt,
        closedBy: row.closedBy,
        closeReason: row.closeReason,
        items: row.items.map((item) => {
          const askQty = item.askQty.toFixed(3);
          const deliveredQty = item.deliveredQty.toFixed(3);
          const held = Quantity.of(
            inFlight.get(item.id) ?? "0",
            "unit",
          ).toDecimalString();
          return {
            id: item.id,
            position: item.position,
            materialId: item.materialId,
            materialName: item.materialName,
            uomId: item.uomId,
            uomName: item.uomName,
            askQty,
            deliveredQty,
            inFlightQty: held,
            pendingQty:
              row.status === "closed"
                ? "0.000"
                : pendingQuantity(askQty, deliveredQty, held),
            remark: item.remark,
          };
        }),
        deliveryNotes: row.deliveryNotes.map((note) => ({
          id: note.id,
          number: note.number,
          deliveryDate: calendarDateFromDb(note.deliveryDate),
          status: deliveryNoteStatus(note),
        })),
        createdAt: row.createdAt,
        createdBy: row.createdBy,
        updatedAt: row.updatedAt,
      };
    });
  }
}

function rowSnapshot(row: Row) {
  return {
    number: row.number,
    requestDate: calendarDateFromDb(row.requestDate),
    storeId: row.storeId,
    contractorId: row.contractorId,
    departmentId: row.departmentId,
    siteLocation: row.siteLocation,
    receiverName: row.receiverName,
    remark: row.remark,
    status: row.status,
    items: row.items.map((item) => ({
      materialId: item.materialId,
      askQty: item.askQty.toFixed(3),
      remark: item.remark,
    })),
  };
}
