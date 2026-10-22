import {
  assertCan,
  can,
  menuByKey,
  type Flag,
  type MemberAccess,
} from "@/src/shared-kernel/access";
import { fromMask } from "@/src/shared-kernel/access/flags";
import { requiredText } from "@/src/shared-kernel/approval";
import { recordAudit } from "@/src/shared-kernel/audit";
import type { CalendarDate } from "@/src/shared-kernel/calendar-date";
import { DomainError } from "@/src/shared-kernel/domain-error";
import { newId } from "@/src/shared-kernel/ids";
import {
  locationRef,
  type LocationRef,
  type LocationRefInput,
} from "@/src/shared-kernel/location-ref";

import { quantityText } from "../domain/boq";
import { contractsProjectNotFound } from "../domain/contracts-errors";
import type { MeasurementStatus, Side } from "../domain/contract-terms";
import {
  assertMeasurementAction,
  assertNotBilled,
  assertRowCount,
  jointMeasurement,
  measuredItems,
  measurementActions,
  measurementChanged,
  measurementHeader,
  measurementItemInvalid,
  measurementNotFound,
  measurementRow,
  measurementRowsRequired,
  measurementWorkOrderInvalid,
  measurementWorkOrderNotAllowed,
  measurementWorkOrderRequired,
  overWorkOrderMessage,
  rowsOver,
  type JointMeasurementInput,
  type MeasuredItem,
  type MeasurementHeaderInput,
  type MeasurementRowInput,
} from "../domain/measurement";
import type { MeasurementSubmitted } from "../domain/measurement-events";
import type { StoredBoqItem } from "./boq-ports";
import {
  MEASUREMENT_MENU,
  type MeasurementCursor,
  type MeasurementDeps,
  type StoredMeasurementRow,
  type StoredMeasurementSheet,
} from "./measurement-ports";
import type {
  ContractsProjectFacts,
  ContractsProjectRole,
  ContractsTx,
} from "./ports";
import type { StoredWorkOrder, StoredWorkOrderLine } from "./work-order-ports";

export { MEASUREMENT_MENU } from "./measurement-ports";

/** At most this many issued Work Orders in the form's picker. */
export const MEASUREMENT_WORK_ORDER_OPTIONS_MAX = 500;

// ---------------------------------------------------------------------------
// Commands and views
// ---------------------------------------------------------------------------

export type MeasurementRowCommand = MeasurementRowInput & {
  location?: LocationRefInput | null;
};

export type MeasurementContentCommand = MeasurementHeaderInput & {
  rows: readonly MeasurementRowCommand[];
};

export type CreateMeasurementCommand = MeasurementContentCommand & {
  side: Side;
  workOrderId?: string | null;
};

export type MeasurementListParams = {
  side?: Side;
  workOrderId?: string;
  status?: MeasurementStatus;
  from?: CalendarDate;
  to?: CalendarDate;
  limit: number;
  after?: MeasurementCursor;
  before?: MeasurementCursor;
};

export type MeasurementSheetView = StoredMeasurementSheet & {
  workOrderNumber: string | null;
  /** The Client (client side) or the Contractor (contractor side). */
  partyLabel: string | null;
  rowCount: number;
  photoCount: number;
  /** A bill has taken a row: read-only. */
  billed: boolean;
};

/** One item of the sheet's side, as rows and the cumulative panel name it. */
export type MeasurementItemFacts = {
  id: string;
  itemNo: string | null;
  description: string;
  uomName: string;
  /** Current BOQ quantity or the Work Order line's quantity. */
  quantity: bigint;
};

export type MeasurementRowView = StoredMeasurementRow & {
  item: MeasurementItemFacts | null;
  /** Pushes its item over the planned quantity (deviation / over the Work Order). */
  over: boolean;
};

export type MeasuredItemView = MeasuredItem & {
  item: MeasurementItemFacts | null;
};

/** What the viewer may do with the sheet now (flags, creator, status, bills). */
export type MeasurementAllowed = {
  edit: boolean;
  delete: boolean;
  submit: boolean;
  check: boolean;
  return: boolean;
  reopen: boolean;
  photos: boolean;
};

export type MeasurementDetail = {
  sheet: MeasurementSheetView;
  projectName: string;
  role: ContractsProjectRole;
  rows: MeasurementRowView[];
  items: MeasuredItemView[];
  /** Hundredths of a percent (client side); null on the contractor side. */
  deviationLimit: bigint | null;
  /** Contractor side: lines over the Work Order (billing refuses them). */
  warnings: { lineId: string; message: string }[];
  createdByName: string | null;
  submittedByName: string | null;
  checkedByName: string | null;
  viewerFlags: Flag[];
  allowed: MeasurementAllowed;
};

export type MeasurementFormOptions = {
  role: ContractsProjectRole;
  structure: "wings" | "locations";
  clientName: string | null;
  boqItems: (MeasurementItemFacts & { sectionTitle: string })[];
  workOrders: {
    id: string;
    number: string;
    contractorName: string;
    lines: MeasurementItemFacts[];
  }[];
};

export type MeasurementQuantities = {
  side: Side;
  workOrderId: string | null;
  deviationLimit: bigint | null;
  items: (MeasurementItemFacts & {
    checked: bigint;
    /** Submitted, not yet checked. */
    pending: bigint;
    over: boolean;
    overLimit: boolean;
    percentOver: bigint | null;
  })[];
};

const unique = (ids: readonly (string | null)[]): string[] => [
  ...new Set(ids.filter((id): id is string => id != null)),
];

function itemIdOf(row: {
  boqItemId: string | null;
  workOrderLineId: string | null;
}) {
  return row.boqItemId ?? row.workOrderLineId ?? "";
}

function auditSnapshot(
  sheet: StoredMeasurementSheet,
  rows?: readonly StoredMeasurementRow[],
) {
  return {
    side: sheet.side,
    workOrderId: sheet.workOrderId,
    measuredOn: sheet.measuredOn,
    status: sheet.status,
    title: sheet.title,
    partyName: sheet.partyName,
    partyRole: sheet.partyRole,
    jointOn: sheet.jointOn,
    ...(rows == null
      ? {}
      : {
          rowCount: rows.length,
          quantity: quantityText(
            rows.reduce((sum, row) => sum + row.quantity, 0n),
          ),
        }),
  };
}

/** A row's location error, named after the row. */
function rowLocationError(error: unknown, row: number): unknown {
  if (!(error instanceof DomainError)) return error;
  const details = (error.details ?? {}) as Record<string, unknown>;
  const field = typeof details["field"] === "string" ? details["field"] : null;
  return new DomainError(error.code, error.message, {
    details: {
      ...details,
      row,
      field: `rows.${String(row)}.location${field == null ? "" : `.${field}`}`,
    },
  });
}

/**
 * The Measurement Book (CM-1105, ADR CM-0023 §6; menu
 * `contracts.measurements`, CRUDAPNO, Project-level; Approve = check).
 * Client-side sheets measure BOQ items, contractor-side sheets the lines
 * of one issued Work Order. Every command takes the Project's BOQ lock, so
 * a check, reopen or delete never crosses a BOQ or Work Order change.
 */
export class MeasurementHandlers {
  private readonly clock: () => Date;

  constructor(private readonly deps: MeasurementDeps) {
    this.clock = deps.clock ?? (() => new Date());
  }

  // Loading -------------------------------------------------------------------

  async find(workspaceId: string, id: string): Promise<StoredMeasurementSheet> {
    const found = await this.deps.store.find(this.deps.db, workspaceId, id);
    if (found == null) throw measurementNotFound();
    return found;
  }

  private async project(
    db: ContractsTx,
    workspaceId: string,
    projectId: string,
  ): Promise<ContractsProjectFacts> {
    const project = await this.deps.directory.project(
      db,
      workspaceId,
      projectId,
    );
    if (project == null) throw contractsProjectNotFound();
    return project;
  }

  viewerFlags(access: MemberAccess, projectId: string): Flag[] {
    const supported = fromMask(menuByKey(MEASUREMENT_MENU)?.supported ?? 0);
    return supported.filter((flag) =>
      can(access, MEASUREMENT_MENU, flag, { projectId }),
    );
  }

  /** Create or Update on the Project: the form's pickers. */
  private assertEditor(access: MemberAccess, projectId: string): void {
    if (!can(access, MEASUREMENT_MENU, "create", { projectId }))
      assertCan(access, MEASUREMENT_MENU, "update", { projectId });
  }

  /** Whether the viewer may edit or submit a draft: its creator with Create, or Update. */
  private mayEditDraft(
    access: MemberAccess,
    sheet: StoredMeasurementSheet,
  ): boolean {
    const scope = { projectId: sheet.projectId };
    return (
      (sheet.createdBy === access.userId &&
        can(access, MEASUREMENT_MENU, "create", scope)) ||
      can(access, MEASUREMENT_MENU, "update", scope)
    );
  }

  /** A draft is deleted by its creator (with Create) or a Delete holder; later, Delete only. */
  private mayDelete(
    access: MemberAccess,
    sheet: StoredMeasurementSheet,
  ): boolean {
    const scope = { projectId: sheet.projectId };
    if (can(access, MEASUREMENT_MENU, "delete", scope)) return true;
    return (
      sheet.status === "draft" &&
      sheet.createdBy === access.userId &&
      can(access, MEASUREMENT_MENU, "create", scope)
    );
  }

  private assertDraftEditor(
    access: MemberAccess,
    sheet: StoredMeasurementSheet,
  ): void {
    if (!this.mayEditDraft(access, sheet))
      assertCan(access, MEASUREMENT_MENU, "update", {
        projectId: sheet.projectId,
      });
  }

  private assertDeleter(
    access: MemberAccess,
    sheet: StoredMeasurementSheet,
  ): void {
    if (!this.mayDelete(access, sheet))
      assertCan(access, MEASUREMENT_MENU, "delete", {
        projectId: sheet.projectId,
      });
  }

  allowed(
    access: MemberAccess,
    sheet: StoredMeasurementSheet,
    billed: boolean,
  ): MeasurementAllowed {
    const scope = { projectId: sheet.projectId };
    const steps = measurementActions(sheet.status, billed);
    const approve = can(access, MEASUREMENT_MENU, "approve", scope);
    const editor = this.mayEditDraft(access, sheet);
    return {
      edit: steps.edit && editor,
      submit: steps.submit && editor,
      delete: steps.delete && this.mayDelete(access, sheet),
      check: steps.check && approve,
      return: steps.return && approve,
      reopen: steps.reopen && approve,
      photos:
        !billed &&
        (can(access, MEASUREMENT_MENU, "create", scope) ||
          can(access, MEASUREMENT_MENU, "update", scope)),
    };
  }

  /** Work Order numbers, party names, row and photo counts, billed. */
  async views(
    db: ContractsTx,
    workspaceId: string,
    sheets: readonly StoredMeasurementSheet[],
  ): Promise<MeasurementSheetView[]> {
    if (sheets.length === 0) return [];
    const { store, workOrders, directory } = this.deps;
    const ids = sheets.map((sheet) => sheet.id);
    const [rows, photos, orders, projects] = await Promise.all([
      store.rows(db, workspaceId, ids),
      store.photoCounts(db, workspaceId, ids),
      Promise.all(
        unique(sheets.map((sheet) => sheet.workOrderId)).map((id) =>
          workOrders.find(db, workspaceId, id),
        ),
      ),
      Promise.all(
        unique(sheets.map((sheet) => sheet.projectId)).map((id) =>
          directory.project(db, workspaceId, id),
        ),
      ),
    ]);
    const orderById = new Map(
      orders
        .filter((order): order is StoredWorkOrder => order != null)
        .map((order) => [order.id, order]),
    );
    const contractorNames = new Map<string, string>();
    await Promise.all(
      [...orderById.values()].map(async (order) => {
        const facts = await directory.contractors(
          db,
          workspaceId,
          order.projectId,
          [order.contractorId],
        );
        contractorNames.set(
          order.id,
          facts.get(order.contractorId)?.name ?? "",
        );
      }),
    );
    const clientNames = new Map(
      projects
        .filter((project) => project != null)
        .map((project) => [project.id, project.clientName]),
    );
    const rowsOf = new Map<string, StoredMeasurementRow[]>();
    for (const row of rows)
      rowsOf.set(row.sheetId, [...(rowsOf.get(row.sheetId) ?? []), row]);
    return sheets.map((sheet) => {
      const own = rowsOf.get(sheet.id) ?? [];
      const order =
        sheet.workOrderId == null
          ? undefined
          : orderById.get(sheet.workOrderId);
      return {
        ...sheet,
        workOrderNumber: order?.number ?? null,
        partyLabel:
          sheet.side === "client"
            ? (clientNames.get(sheet.projectId) ?? null)
            : order == null
              ? null
              : (contractorNames.get(order.id) ?? null),
        rowCount: own.length,
        photoCount: photos.get(sheet.id) ?? 0,
        billed: own.some((row) => row.billId != null),
      };
    });
  }

  /** BOQ items by id with their UoM names (removed ones included). */
  private async boqFacts(
    db: ContractsTx,
    workspaceId: string,
    items: readonly StoredBoqItem[],
  ): Promise<Map<string, MeasurementItemFacts>> {
    const uoms = await this.deps.directory.uoms(
      db,
      workspaceId,
      unique(items.map((item) => item.uomId)),
    );
    return new Map(
      items.map((item) => [
        item.id,
        {
          id: item.id,
          itemNo: item.itemNo,
          description: item.description,
          uomName: uoms.get(item.uomId)?.name ?? "",
          quantity: item.quantity,
        },
      ]),
    );
  }

  private async lineFacts(
    db: ContractsTx,
    workspaceId: string,
    lines: readonly StoredWorkOrderLine[],
  ): Promise<Map<string, MeasurementItemFacts>> {
    const uoms = await this.deps.directory.uoms(
      db,
      workspaceId,
      unique(lines.map((line) => line.uomId)),
    );
    return new Map(
      lines.map((line) => [
        line.id,
        {
          id: line.id,
          itemNo: line.itemNo,
          description: line.description,
          uomName: uoms.get(line.uomId)?.name ?? "",
          quantity: line.quantity,
        },
      ]),
    );
  }

  // Reads ---------------------------------------------------------------------

  /** The Project's sheets, latest measured first (Measurement Book read). */
  async list(
    access: MemberAccess,
    projectId: string,
    params: MeasurementListParams,
  ) {
    assertCan(access, MEASUREMENT_MENU, "read", { projectId });
    const { db, store } = this.deps;
    await this.project(db, access.workspaceId, projectId);
    const page = await store.list(db, {
      ...params,
      workspaceId: access.workspaceId,
      projectId,
    });
    return {
      ...page,
      items: await this.views(db, access.workspaceId, page.items),
      viewerFlags: this.viewerFlags(access, projectId),
    };
  }

  /** One sheet with its rows, the cumulative panel and photos' count (read). */
  async get(access: MemberAccess, id: string): Promise<MeasurementDetail> {
    const sheet = await this.find(access.workspaceId, id);
    assertCan(access, MEASUREMENT_MENU, "read", { projectId: sheet.projectId });
    return this.detail(access, sheet);
  }

  private async detail(
    access: MemberAccess,
    sheet: StoredMeasurementSheet,
  ): Promise<MeasurementDetail> {
    const { db, store, boq, workOrders } = this.deps;
    const ws = access.workspaceId;
    const [project, [view], rows, checked, names] = await Promise.all([
      this.project(db, ws, sheet.projectId),
      this.views(db, ws, [sheet]),
      store.rows(db, ws, [sheet.id]),
      store.measuredByItem(db, {
        workspaceId: ws,
        projectId: sheet.projectId,
        side: sheet.side,
        statuses: ["checked"],
        exceptSheetId: sheet.id,
      }),
      store.names(
        db,
        ws,
        unique([sheet.createdBy, sheet.submittedBy, sheet.checkedBy]),
      ),
    ]);
    if (view == null) throw measurementNotFound();
    let facts: Map<string, MeasurementItemFacts>;
    let limit: bigint | null = null;
    if (sheet.side === "client") {
      const [items, settings] = await Promise.all([
        boq.itemsById(db, ws, unique(rows.map((row) => row.boqItemId))),
        boq.settings(db, ws),
      ]);
      facts = await this.boqFacts(db, ws, [...items.values()]);
      limit = settings.deviationLimit;
    } else {
      const lines =
        sheet.workOrderId == null
          ? []
          : await workOrders.lines(db, ws, [sheet.workOrderId]);
      facts = await this.lineFacts(db, ws, lines);
    }
    const planned = new Map(
      [...facts].map(([itemId, item]) => [itemId, item.quantity]),
    );
    const keyed = rows.map((row) => ({
      itemId: itemIdOf(row),
      quantity: row.quantity,
    }));
    const marked = rowsOver(keyed, planned, checked);
    const items = measuredItems(keyed, planned, checked, limit).map((item) => ({
      ...item,
      item: facts.get(item.itemId) ?? null,
    }));
    return {
      sheet: view,
      projectName: project.name,
      role: project.role,
      rows: rows.map((row, index) => ({
        ...row,
        item: facts.get(itemIdOf(row)) ?? null,
        over: marked.has(index),
      })),
      items,
      deviationLimit: limit,
      warnings:
        sheet.side === "contractor"
          ? items
              .filter((item) => item.over)
              .map((item) => ({
                lineId: item.itemId,
                message: overWorkOrderMessage(
                  item.item?.itemNo ?? null,
                  item.total,
                  item.planned,
                ),
              }))
          : [],
      createdByName: names.get(sheet.createdBy) ?? null,
      submittedByName:
        sheet.submittedBy == null
          ? null
          : (names.get(sheet.submittedBy) ?? null),
      checkedByName:
        sheet.checkedBy == null ? null : (names.get(sheet.checkedBy) ?? null),
      viewerFlags: this.viewerFlags(access, sheet.projectId),
      allowed: this.allowed(access, sheet, view.billed),
    };
  }

  /** The issued Work Orders and their live lines (contractor side). */
  private async issuedWorkOrders(
    db: ContractsTx,
    workspaceId: string,
    projectId: string,
  ): Promise<MeasurementFormOptions["workOrders"]> {
    const { workOrders, directory } = this.deps;
    const page = await workOrders.list(db, {
      workspaceId,
      projectId,
      status: "issued",
      limit: MEASUREMENT_WORK_ORDER_OPTIONS_MAX,
    });
    if (page.items.length === 0) return [];
    const [lines, contractors] = await Promise.all([
      workOrders.lines(
        db,
        workspaceId,
        page.items.map((order) => order.id),
      ),
      directory.contractors(
        db,
        workspaceId,
        projectId,
        unique(page.items.map((order) => order.contractorId)),
      ),
    ]);
    const facts = await this.lineFacts(db, workspaceId, lines);
    return [...page.items]
      .sort((a, b) => (a.number ?? "").localeCompare(b.number ?? ""))
      .map((order) => ({
        id: order.id,
        number: order.number ?? "",
        contractorName: contractors.get(order.contractorId)?.name ?? "",
        lines: lines
          .filter((line) => line.workOrderId === order.id)
          .flatMap((line) => facts.get(line.id) ?? []),
      }));
  }

  /** The BOQ's live items in section order with their section titles. */
  private async boqOptions(
    db: ContractsTx,
    workspaceId: string,
    projectId: string,
  ): Promise<MeasurementFormOptions["boqItems"]> {
    const { boq } = this.deps;
    const [sections, items] = await Promise.all([
      boq.sections(db, workspaceId, projectId),
      boq.items(db, workspaceId, projectId),
    ]);
    const order = new Map(
      sections.map((section, index) => [section.id, index]),
    );
    const titles = new Map(sections.map((s) => [s.id, s.title]));
    const facts = await this.boqFacts(db, workspaceId, items);
    return [...items]
      .sort(
        (a, b) =>
          (order.get(a.sectionId) ?? 0) - (order.get(b.sectionId) ?? 0) ||
          a.position - b.position,
      )
      .flatMap((item) => {
        const fact = facts.get(item.id);
        return fact == null
          ? []
          : [{ ...fact, sectionTitle: titles.get(item.sectionId) ?? "" }];
      });
  }

  /** BOQ items, or issued Work Orders and their lines, for the form (create or update). */
  async formOptions(
    access: MemberAccess,
    projectId: string,
  ): Promise<MeasurementFormOptions> {
    this.assertEditor(access, projectId);
    const { db } = this.deps;
    const ws = access.workspaceId;
    const project = await this.project(db, ws, projectId);
    const [boqItems, workOrders] = await Promise.all([
      this.boqOptions(db, ws, projectId),
      this.issuedWorkOrders(db, ws, projectId),
    ]);
    return {
      role: project.role,
      structure: project.structure,
      clientName: project.clientName,
      boqItems,
      workOrders,
    };
  }

  /**
   * Measured to date per item of a side (read): every BOQ item, or every
   * line of one Work Order, with the checked and the submitted (not yet
   * checked) quantity and the deviation or over-quantity marks.
   */
  async quantities(
    access: MemberAccess,
    projectId: string,
    side: Side,
    workOrderId: string | null,
  ): Promise<MeasurementQuantities> {
    assertCan(access, MEASUREMENT_MENU, "read", { projectId });
    const { db, store, boq, workOrders } = this.deps;
    const ws = access.workspaceId;
    await this.project(db, ws, projectId);
    let facts: MeasurementItemFacts[];
    let limit: bigint | null = null;
    if (side === "client") {
      if (workOrderId != null) throw measurementWorkOrderNotAllowed();
      const [options, settings] = await Promise.all([
        this.boqOptions(db, ws, projectId),
        boq.settings(db, ws),
      ]);
      facts = options;
      limit = settings.deviationLimit;
    } else {
      if (workOrderId == null) throw measurementWorkOrderRequired();
      const order = await workOrders.find(db, ws, workOrderId);
      if (order?.projectId !== projectId) throw measurementWorkOrderInvalid();
      const lines = await workOrders.lines(db, ws, [order.id]);
      const byId = await this.lineFacts(db, ws, lines);
      facts = lines.flatMap((line) => byId.get(line.id) ?? []);
    }
    const query = { workspaceId: ws, projectId, side, exceptSheetId: null };
    const [checked, pending] = await Promise.all([
      store.measuredByItem(db, { ...query, statuses: ["checked"] }),
      store.measuredByItem(db, { ...query, statuses: ["submitted"] }),
    ]);
    return {
      side,
      workOrderId,
      deviationLimit: limit,
      items: facts.map((fact) => {
        const total = checked.get(fact.id) ?? 0n;
        const [mark] = measuredItems(
          [{ itemId: fact.id, quantity: total }],
          new Map([[fact.id, fact.quantity]]),
          new Map(),
          limit,
        );
        return {
          ...fact,
          checked: total,
          pending: pending.get(fact.id) ?? 0n,
          over: mark?.over ?? false,
          overLimit: mark?.overLimit ?? false,
          percentOver: mark?.percentOver ?? null,
        };
      }),
    };
  }

  // Content -------------------------------------------------------------------

  /** The sheet's Work Order: issued and the Project's (400 otherwise). */
  private async issuedWorkOrder(
    tx: ContractsTx,
    workspaceId: string,
    projectId: string,
    workOrderId: string,
  ): Promise<StoredWorkOrder> {
    const order = await this.deps.workOrders.find(tx, workspaceId, workOrderId);
    if (order?.projectId !== projectId || order.status !== "issued")
      throw measurementWorkOrderInvalid();
    return order;
  }

  /**
   * Checks the rows inside the lock: each names an item of its side (a
   * live BOQ item of the Project, or a live line of the sheet's Work
   * Order), and its location is on the Project.
   */
  private async resolveRows(
    tx: ContractsTx,
    access: MemberAccess,
    sheet: Pick<
      StoredMeasurementSheet,
      "id" | "projectId" | "side" | "workOrderId"
    >,
    commands: readonly MeasurementRowCommand[],
    at: Date,
  ): Promise<StoredMeasurementRow[]> {
    assertRowCount(commands.length);
    const ws = access.workspaceId;
    const fields = commands.map((command, index) =>
      measurementRow(command, sheet.side, index),
    );
    const known = new Set(
      sheet.side === "client"
        ? (await this.deps.boq.items(tx, ws, sheet.projectId)).map((i) => i.id)
        : sheet.workOrderId == null
          ? []
          : (await this.deps.workOrders.lines(tx, ws, [sheet.workOrderId])).map(
              (line) => line.id,
            ),
    );
    const rows: StoredMeasurementRow[] = [];
    for (const [index, row] of fields.entries()) {
      const itemId = row.boqItemId ?? row.workOrderLineId ?? "";
      if (!known.has(itemId)) throw measurementItemInvalid(index, sheet.side);
      const raw = commands[index]?.location;
      let location: LocationRef | null = null;
      if (raw != null)
        try {
          location = locationRef(raw);
          await this.deps.locations.assertOnProject(
            ws,
            sheet.projectId,
            location,
          );
        } catch (error) {
          throw rowLocationError(error, index);
        }
      rows.push({
        id: newId(at.getTime()),
        sheetId: sheet.id,
        ...row,
        location,
        position: index,
        billId: null,
      });
    }
    return rows;
  }

  private checkStale(sheet: StoredMeasurementSheet, expected: Date | null) {
    if (expected != null && sheet.updatedAt.getTime() !== expected.getTime())
      throw measurementChanged();
  }

  private async save(
    tx: ContractsTx,
    after: StoredMeasurementSheet,
    expected: Date,
  ): Promise<void> {
    if (!(await this.deps.store.update(tx, after, expected)))
      throw measurementChanged();
  }

  private async audit(
    tx: ContractsTx,
    access: MemberAccess,
    action: string,
    id: string,
    at: Date,
    change: { before?: unknown; after?: unknown },
  ): Promise<void> {
    await recordAudit(tx, {
      workspaceId: access.workspaceId,
      actorUserId: access.userId,
      action,
      entityType: "measurement_sheet",
      entityId: id,
      ...change,
      occurredAt: at,
    });
  }

  /**
   * Inside the lock: the live sheet, not stale, with no billed row
   * (409 `MEASUREMENT_BILLED`).
   */
  private async current(
    tx: ContractsTx,
    workspaceId: string,
    id: string,
    expectedUpdatedAt: Date | null,
  ): Promise<StoredMeasurementSheet> {
    const sheet = await this.deps.store.find(tx, workspaceId, id);
    if (sheet == null) throw measurementNotFound();
    assertNotBilled(await this.deps.store.billedRows(tx, workspaceId, id));
    this.checkStale(sheet, expectedUpdatedAt);
    return sheet;
  }

  // Commands ------------------------------------------------------------------

  /** A draft sheet on one side (Create). */
  async create(
    access: MemberAccess,
    projectId: string,
    input: CreateMeasurementCommand,
  ): Promise<StoredMeasurementSheet> {
    assertCan(access, MEASUREMENT_MENU, "create", { projectId });
    const { db, store, boq } = this.deps;
    const ws = access.workspaceId;
    await this.project(db, ws, projectId);
    const [check, today] = await Promise.all([
      this.deps.backdated(access),
      this.deps.today(ws),
    ]);
    const header = measurementHeader(input, today);
    const typed = input.workOrderId?.trim().toLowerCase() ?? "";
    const workOrderId = typed === "" ? null : typed;
    if (input.side === "client" && workOrderId != null)
      throw measurementWorkOrderNotAllowed();
    if (input.side === "contractor" && workOrderId == null)
      throw measurementWorkOrderRequired();
    check("measurement", "create", header.measuredOn);
    const at = this.clock();
    return db.$transaction(async (tx) => {
      await boq.lock(tx, ws, projectId);
      if (workOrderId != null)
        await this.issuedWorkOrder(tx, ws, projectId, workOrderId);
      const sheet: StoredMeasurementSheet = {
        id: newId(at.getTime()),
        workspaceId: ws,
        projectId,
        side: input.side,
        workOrderId,
        ...header,
        status: "draft",
        submittedAt: null,
        submittedBy: null,
        checkedAt: null,
        checkedBy: null,
        partyName: null,
        partyRole: null,
        jointOn: null,
        returnReason: null,
        reopenReason: null,
        createdAt: at,
        updatedAt: at,
        createdBy: access.userId,
        updatedBy: access.userId,
      };
      const rows = await this.resolveRows(tx, access, sheet, input.rows, at);
      await store.insert(tx, sheet);
      await store.replaceRows(tx, ws, sheet.id, rows);
      await this.audit(tx, access, "measurement_sheet.created", sheet.id, at, {
        after: auditSnapshot(sheet, rows),
      });
      return sheet;
    });
  }

  /**
   * Saves a draft (its creator with Create, or Update; 409
   * `MEASUREMENT_CHANGED` when stale). The side and Work Order stay; the
   * rows are replaced.
   */
  async update(
    access: MemberAccess,
    id: string,
    expectedUpdatedAt: Date,
    input: MeasurementContentCommand,
  ): Promise<StoredMeasurementSheet> {
    const before = await this.find(access.workspaceId, id);
    this.assertDraftEditor(access, before);
    const { db, store, boq } = this.deps;
    const ws = access.workspaceId;
    const [check, today] = await Promise.all([
      this.deps.backdated(access),
      this.deps.today(ws),
    ]);
    const header = measurementHeader(input, today);
    const at = this.clock();
    return db.$transaction(async (tx) => {
      await boq.lock(tx, ws, before.projectId);
      const current = await this.current(tx, ws, id, expectedUpdatedAt);
      assertMeasurementAction(current.status, "edit");
      check("measurement", "edit", current.measuredOn);
      if (header.measuredOn !== current.measuredOn)
        check("measurement", "edit", header.measuredOn);
      if (current.workOrderId != null)
        await this.issuedWorkOrder(
          tx,
          ws,
          current.projectId,
          current.workOrderId,
        );
      const rows = await this.resolveRows(tx, access, current, input.rows, at);
      const previous = await store.rows(tx, ws, [id]);
      const after: StoredMeasurementSheet = {
        ...current,
        ...header,
        updatedAt: at,
        updatedBy: access.userId,
      };
      await this.save(tx, after, current.updatedAt);
      await store.replaceRows(tx, ws, id, rows);
      await this.audit(tx, access, "measurement_sheet.updated", id, at, {
        before: auditSnapshot(current, previous),
        after: auditSnapshot(after, rows),
      });
      return after;
    });
  }

  /**
   * Deletes a sheet (a tombstone): a draft by its creator with Create or a
   * Delete holder; a submitted or checked one by a Delete holder. Refused
   * once a bill has taken a row (409 `MEASUREMENT_BILLED`).
   */
  async delete(
    access: MemberAccess,
    id: string,
    expectedUpdatedAt: Date | null,
  ): Promise<void> {
    const before = await this.find(access.workspaceId, id);
    this.assertDeleter(access, before);
    const { db, store, boq } = this.deps;
    const ws = access.workspaceId;
    const at = this.clock();
    await db.$transaction(async (tx) => {
      await boq.lock(tx, ws, before.projectId);
      const current = await this.current(tx, ws, id, expectedUpdatedAt);
      this.assertDeleter(access, current);
      const rows = await store.rows(tx, ws, [id]);
      const deleted = await store.delete(tx, {
        sheet: current,
        expectedUpdatedAt,
        by: access.userId,
        at,
      });
      if (!deleted) throw measurementChanged();
      await this.audit(tx, access, "measurement_sheet.deleted", id, at, {
        before: auditSnapshot(current, rows),
      });
    });
  }

  /**
   * Sends a draft for its joint measurement (its creator with Create, or
   * Update): it needs rows. Tells the Approve + Notification holders.
   */
  async submit(
    access: MemberAccess,
    id: string,
    expectedUpdatedAt: Date | null,
  ): Promise<StoredMeasurementSheet> {
    const before = await this.find(access.workspaceId, id);
    this.assertDraftEditor(access, before);
    const { db, store, boq } = this.deps;
    const ws = access.workspaceId;
    const at = this.clock();
    const { after, rowCount } = await db.$transaction(async (tx) => {
      await boq.lock(tx, ws, before.projectId);
      const current = await this.current(tx, ws, id, expectedUpdatedAt);
      assertMeasurementAction(current.status, "submit");
      const rows = await store.rows(tx, ws, [id]);
      if (rows.length === 0) throw measurementRowsRequired();
      if (current.workOrderId != null)
        await this.issuedWorkOrder(
          tx,
          ws,
          current.projectId,
          current.workOrderId,
        );
      const submitted: StoredMeasurementSheet = {
        ...current,
        status: "submitted",
        submittedAt: at,
        submittedBy: access.userId,
        returnReason: null,
        updatedAt: at,
        updatedBy: access.userId,
      };
      await this.save(tx, submitted, current.updatedAt);
      await this.audit(tx, access, "measurement_sheet.submitted", id, at, {
        before: auditSnapshot(current),
        after: auditSnapshot(submitted, rows),
      });
      return { after: submitted, rowCount: rows.length };
    });
    const [view] = await this.views(db, ws, [after]);
    const event: MeasurementSubmitted = {
      type: "MeasurementSubmitted",
      workspaceId: ws,
      occurredAt: at,
      sheetId: after.id,
      projectId: after.projectId,
      side: after.side,
      measuredOn: after.measuredOn,
      title: after.title,
      workOrderNumber: view?.workOrderNumber ?? null,
      partyName: view?.partyLabel ?? null,
      rowCount,
      by: access.userId,
    };
    await this.deps.events.dispatch([event]);
    return after;
  }

  /**
   * Checks a submitted sheet (Approve): the joint measurement, recording
   * our engineer (the caller), the other party's name and role, and the
   * date. Its rows now count as measured (BOQ items lock, CM-1103).
   */
  async check(
    access: MemberAccess,
    id: string,
    input: JointMeasurementInput,
    expectedUpdatedAt: Date | null,
  ): Promise<StoredMeasurementSheet> {
    const before = await this.find(access.workspaceId, id);
    assertCan(access, MEASUREMENT_MENU, "approve", {
      projectId: before.projectId,
    });
    const { db, boq } = this.deps;
    const ws = access.workspaceId;
    const today = await this.deps.today(ws);
    const at = this.clock();
    return db.$transaction(async (tx) => {
      await boq.lock(tx, ws, before.projectId);
      const current = await this.current(tx, ws, id, expectedUpdatedAt);
      assertMeasurementAction(current.status, "check");
      const joint = jointMeasurement(input, current.measuredOn, today);
      if (current.workOrderId != null)
        await this.issuedWorkOrder(
          tx,
          ws,
          current.projectId,
          current.workOrderId,
        );
      const after: StoredMeasurementSheet = {
        ...current,
        status: "checked",
        checkedAt: at,
        checkedBy: access.userId,
        ...joint,
        reopenReason: null,
        updatedAt: at,
        updatedBy: access.userId,
      };
      await this.save(tx, after, current.updatedAt);
      await this.audit(tx, access, "measurement_sheet.checked", id, at, {
        before: auditSnapshot(current),
        after: auditSnapshot(after),
      });
      return after;
    });
  }

  /** Returns a submitted sheet to draft with a reason (Approve). */
  async returnToDraft(
    access: MemberAccess,
    id: string,
    rawReason: string,
    expectedUpdatedAt: Date | null,
  ): Promise<StoredMeasurementSheet> {
    const before = await this.find(access.workspaceId, id);
    assertCan(access, MEASUREMENT_MENU, "approve", {
      projectId: before.projectId,
    });
    const reason = requiredText(rawReason, "RETURN_REASON_REQUIRED", "reason");
    const { db, boq } = this.deps;
    const ws = access.workspaceId;
    const at = this.clock();
    return db.$transaction(async (tx) => {
      await boq.lock(tx, ws, before.projectId);
      const current = await this.current(tx, ws, id, expectedUpdatedAt);
      assertMeasurementAction(current.status, "return");
      const after: StoredMeasurementSheet = {
        ...current,
        status: "draft",
        submittedAt: null,
        submittedBy: null,
        returnReason: reason,
        updatedAt: at,
        updatedBy: access.userId,
      };
      await this.save(tx, after, current.updatedAt);
      await this.audit(tx, access, "measurement_sheet.returned", id, at, {
        before: auditSnapshot(current),
        after: { ...auditSnapshot(after), reason },
      });
      return after;
    });
  }

  /**
   * Reopens a checked sheet to submitted with a reason (Approve), only
   * while no bill has taken a row (409 `MEASUREMENT_BILLED`). The joint
   * measurement is cleared (the audit keeps it), so its rows stop counting
   * as measured.
   */
  async reopen(
    access: MemberAccess,
    id: string,
    rawReason: string,
    expectedUpdatedAt: Date | null,
  ): Promise<StoredMeasurementSheet> {
    const before = await this.find(access.workspaceId, id);
    assertCan(access, MEASUREMENT_MENU, "approve", {
      projectId: before.projectId,
    });
    const reason = requiredText(rawReason, "REOPEN_REASON_REQUIRED", "reason");
    const { db, boq } = this.deps;
    const ws = access.workspaceId;
    const at = this.clock();
    return db.$transaction(async (tx) => {
      await boq.lock(tx, ws, before.projectId);
      const current = await this.current(tx, ws, id, expectedUpdatedAt);
      assertMeasurementAction(current.status, "reopen");
      const after: StoredMeasurementSheet = {
        ...current,
        status: "submitted",
        checkedAt: null,
        checkedBy: null,
        partyName: null,
        partyRole: null,
        jointOn: null,
        reopenReason: reason,
        updatedAt: at,
        updatedBy: access.userId,
      };
      await this.save(tx, after, current.updatedAt);
      await this.audit(tx, access, "measurement_sheet.reopened", id, at, {
        before: auditSnapshot(current),
        after: { ...auditSnapshot(after), reason },
      });
      return after;
    });
  }
}
