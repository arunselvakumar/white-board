import type { Prisma } from "@repo/construction-db";

import { assertCan, can, type MemberAccess } from "@/src/shared-kernel/access";
import {
  bulkIds,
  bulkRefused,
  requiredText,
  type BulkRefusal,
} from "@/src/shared-kernel/approval";
import {
  approvalEvent,
  savedOutcome,
  type ApprovalOutcome,
} from "@/src/shared-kernel/approval-events";
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
import { newId } from "@/src/shared-kernel/ids";
import type { ListCursor } from "@/src/shared-kernel/list-cursor";
import {
  locationRef,
  type LocationRef,
  type LocationRefInput,
  type LocationResolver,
} from "@/src/shared-kernel/location-ref";
import { Quantity } from "@/src/shared-kernel/quantity";
import { nextSequenceNumber } from "@/src/shared-kernel/sequence/next-sequence-number";

import { siteWorkDocumentMediaRemoved } from "../domain/document-thread";
import type { SheetApprovalStatus } from "../domain/shift";
import {
  assertWorksheetTask,
  worksheetPostsProgress,
  worksheetTaskPosting,
  type WorksheetTaskPosting,
} from "../domain/worksheet-task";
import { SITE_WORK_DOCUMENTS } from "../domain/site-work-documents";
import {
  assertSheetDateNotFuture,
  attendanceHeadcount,
  decideWorksheet,
  labourPrefill,
  savedApproval,
  worksheetContent,
  type Headcount,
  type LabourPrefill,
  type WorksheetApproval,
  type WorksheetContent,
  type WorksheetFacts,
  type WorksheetInput,
  type WorksheetLine,
  type WorksheetLineInput,
  type WorksheetSettings,
} from "../domain/worksheet";
import type {
  AttendanceHeadcounts,
  SiteStock,
  TaskProgressPosting,
  WorksheetContractorFacts,
  WorksheetDirectory,
  WorksheetNamedFacts,
  WorksheetWorkTypeFacts,
} from "./ports";
import type { WorksheetSettingsHandlers } from "./worksheet-settings-handlers";
import { removeFromGallery } from "./gallery-index";

type Db = Prisma.TransactionClient;

const DOCUMENT = SITE_WORK_DOCUMENTS.worksheet;
const MENU = DOCUMENT.menu;
/** The stock ledger's source type for worksheet lines (CM-0016 §5). */
const STOCK_SOURCE = "daily_worksheet" as const;

/** Checks one entry date against the Back-dated Entry policy (CM-113). */
export type BackdatedCheck = (
  module: typeof DOCUMENT.backdated,
  action: "create" | "edit",
  date: CalendarDate,
) => void;

export const worksheetNotFound = () =>
  notFound("WORKSHEET_NOT_FOUND", "This Daily Worksheet was not found.");

// ---------------------------------------------------------------------------
// The store port (Prisma in `infrastructure/prisma-worksheet-store`)
// ---------------------------------------------------------------------------

export type StoredWorksheetLine = WorksheetLine & { id: string };

export type StoredWorksheet = Omit<WorksheetContent, "lines"> & {
  /** The Task the sheet's work is for (CM-806); no foreign key. */
  taskId: string | null;
  id: string;
  workspaceId: string;
  projectId: string;
  number: string;
  approval: WorksheetApproval;
  duplicatedFromId: string | null;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
  updatedBy: string;
  lines: StoredWorksheetLine[];
};

/** What a save writes besides number, approval and bookkeeping. */
export type WorksheetRow = Omit<WorksheetContent, "lines"> & {
  lines: StoredWorksheetLine[];
  taskId: string | null;
};

export type WorksheetListParams = {
  workspaceId: string;
  projectId: string;
  from?: CalendarDate;
  to?: CalendarDate;
  createdBy?: string;
  contractorId?: string;
  departmentId?: string;
  approvalStatus?: SheetApprovalStatus;
  limit: number;
  after?: ListCursor;
  before?: ListCursor;
};

export type WorksheetStore = {
  find(
    db: Db,
    workspaceId: string,
    id: string,
  ): Promise<StoredWorksheet | null>;
  /** Locks the rows `FOR UPDATE` (in id order) and reads them. */
  lock(
    db: Db,
    workspaceId: string,
    ids: readonly string[],
  ): Promise<StoredWorksheet[]>;
  insert(
    db: Db,
    row: WorksheetRow & {
      id: string;
      workspaceId: string;
      projectId: string;
      number: string;
      approval: WorksheetApproval;
      duplicatedFromId: string | null;
      by: string;
      at: Date;
    },
  ): Promise<void>;
  replace(
    db: Db,
    id: string,
    row: WorksheetRow & { approval: WorksheetApproval; by: string; at: Date },
  ): Promise<void>;
  setApproval(
    db: Db,
    id: string,
    approval: WorksheetApproval,
    by: string,
    at: Date,
  ): Promise<void>;
  tombstone(db: Db, id: string, by: string, at: Date): Promise<void>;
  list(
    db: Db,
    params: WorksheetListParams,
  ): Promise<{ items: StoredWorksheet[]; hasMore: boolean; total: number }>;
  /** Who filled, which Contractors and Departments: the Project's live sheets. */
  facets(
    db: Db,
    workspaceId: string,
    projectId: string,
  ): Promise<{
    createdBy: string[];
    contractorIds: string[];
    departmentIds: string[];
  }>;
  /** Skilled and unskilled heads on the Project's live sheets that date. */
  headcounts(
    db: Db,
    workspaceId: string,
    projectId: string,
    date: CalendarDate,
    excludeId: string | null,
  ): Promise<Headcount>;
};

export type WorksheetDeps = {
  db: Db & { $transaction<T>(fn: (tx: Db) => Promise<T>): Promise<T> };
  store: WorksheetStore;
  settings: WorksheetSettingsHandlers;
  directory: WorksheetDirectory;
  attendance: AttendanceHeadcounts;
  locations: LocationResolver;
  stock: SiteStock;
  /** Task progress from the sheet's Approx Work Done (CM-806). */
  tasks: TaskProgressPosting;
  backdated: (actor: MemberAccess) => Promise<BackdatedCheck>;
  today: (workspaceId: string) => Promise<CalendarDate>;
  /**
   * `document.submitted` (saved pending), `document.approved` (Save &
   * Approve, approve) and `document.rejected`, after commit (CM-904).
   */
  events: EventDispatcher;
  /** `ProjectMediaRemoved` for the sheet's photos on delete (ADR CM-0014). */
  media: EventDispatcher;
  clock?: () => Date;
};

// ---------------------------------------------------------------------------
// Inputs and read models
// ---------------------------------------------------------------------------

export type WorksheetCommand = Omit<
  WorksheetInput,
  "sheetDate" | "siteLocation"
> & {
  sheetDate: string;
  siteLocation?: LocationRefInput | null;
  materials?: readonly WorksheetLineInput[];
  /** Save & Approve: needs Approve, and only means something with approval on. */
  approve?: boolean;
  /**
   * A live leaf task of the Project (CM-806); null clears it, left out
   * keeps the sheet's.
   */
  taskId?: string | null;
};

export type WorksheetActions = {
  edit: boolean;
  delete: boolean;
  approve: boolean;
  reject: boolean;
  duplicate: boolean;
};

/** The sheet's Task as screens show it (CM-806). */
export type WorksheetTaskModel = {
  id: string;
  taskNo: number | null;
  name: string | null;
  unitId: string | null;
  unitName: string | null;
  /** Null when the task is no longer live. */
  posting: WorksheetTaskPosting | null;
};

export type WorksheetReadModel = StoredWorksheet & {
  task: WorksheetTaskModel | null;
  contractorName: string | null;
  departmentName: string | null;
  workTypeName: string | null;
  approxWorkUnitName: string | null;
  createdByName: string | null;
  decidedByName: string | null;
};

export type WorksheetFormOptions = {
  settings: WorksheetSettings & { updatedAt: Date | null };
  /** Active Contractors on the Project, each with its enabled Departments. */
  contractors: { id: string; name: string; departmentIds: string[] }[];
  departments: { id: string; name: string }[];
  /** Enabled Work Types of those Departments, with assigned Materials. */
  workTypes: {
    id: string;
    name: string;
    departmentId: string;
    materialIds: string[];
  }[];
  /** Enabled Measurement Units (Approx Work Done). */
  units: { id: string; name: string }[];
};

/** What the caller may do with a sheet now (screens hide the rest). */
export function worksheetActions(
  access: MemberAccess,
  sheet: { projectId: string; approval: { status: SheetApprovalStatus } },
): WorksheetActions {
  const scope = { projectId: sheet.projectId };
  const pending = sheet.approval.status === "pending";
  return {
    edit: can(access, MENU, "update", scope),
    delete: can(access, MENU, "delete", scope),
    approve: pending && can(access, MENU, "approve", scope),
    reject: pending && can(access, MENU, "reject", scope),
    duplicate: can(access, MENU, "create", scope),
  };
}

/** What the audit log keeps of a sheet. */
function snapshot(
  sheet: Omit<WorksheetRow, "lines"> & {
    lines: readonly { materialId: string; quantity: string }[];
    approval?: WorksheetApproval;
  },
) {
  return {
    sheetDate: sheet.sheetDate,
    shift: sheet.shift,
    contractorId: sheet.contractorId,
    departmentId: sheet.departmentId,
    workTypeId: sheet.workTypeId,
    skilledCount: sheet.skilledCount,
    unskilledCount: sheet.unskilledCount,
    approxWorkQty: sheet.approxWorkQty,
    approxWorkUnitId: sheet.approxWorkUnitId,
    siteLocation: sheet.siteLocation,
    remark: sheet.remark,
    taskId: sheet.taskId,
    approvalStatus: sheet.approval?.status,
    materials: sheet.lines.map((line) => ({
      materialId: line.materialId,
      quantity: line.quantity,
    })),
  };
}

function changed(sheet: StoredWorksheet, expectedUpdatedAt: Date | undefined) {
  if (
    expectedUpdatedAt != null &&
    sheet.updatedAt.getTime() !== expectedUpdatedAt.getTime()
  )
    throw conflict(
      "WORKSHEET_CHANGED",
      "Someone changed this Daily Worksheet. Reload it and try again.",
      { updatedAt: sheet.updatedAt.toISOString() },
    );
}

function contentOf(sheet: StoredWorksheet): WorksheetContent {
  return {
    sheetDate: sheet.sheetDate,
    shift: sheet.shift,
    contractorId: sheet.contractorId,
    departmentId: sheet.departmentId,
    workTypeId: sheet.workTypeId,
    skilledCount: sheet.skilledCount,
    unskilledCount: sheet.unskilledCount,
    approxWorkQty: sheet.approxWorkQty,
    approxWorkUnitId: sheet.approxWorkUnitId,
    siteLocation: sheet.siteLocation,
    remark: sheet.remark,
    lines: sheet.lines.map(({ id: _id, ...line }) => line),
  };
}

function sameLocation(a: LocationRef | null, b: LocationRef | null): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function withLineIds(lines: readonly WorksheetLine[]): StoredWorksheetLine[] {
  return lines.map((line) => ({ ...line, id: newId() }));
}

/**
 * Daily Worksheet commands and queries (CM-602). Every write is one
 * transaction: the row lock, the back-dated check, the number, the rows,
 * the stock postings (`SiteStock`, CM-0016 §5) and the audit event; stock
 * events and `document.approved` are dispatched after commit. Permissions
 * are checked here as well as in the routes, because some depend on the
 * request (Save & Approve) or the sheet's Project.
 */
export class WorksheetHandlers {
  private readonly clock: () => Date;

  constructor(private readonly deps: WorksheetDeps) {
    this.clock = deps.clock ?? (() => new Date());
  }

  // -------------------------------------------------------------------------
  // Writes
  // -------------------------------------------------------------------------

  /** The master facts the content rules read, for the ids the input names. */
  private async facts(
    workspaceId: string,
    projectId: string,
    input: WorksheetCommand,
    needsPlaces: boolean,
  ): Promise<WorksheetFacts> {
    const { db, directory } = this.deps;
    const id = (value: string | null | undefined) =>
      value == null || value.trim() === "" ? null : value;
    const contractorId = id(input.contractorId);
    const departmentId = id(input.departmentId);
    const workTypeId = id(input.workTypeId);
    const unitId = id(input.approxWorkUnitId);
    const [contractors, departments, workTypes, units, materials, places] =
      await Promise.all([
        contractorId == null
          ? new Map<string, WorksheetContractorFacts>()
          : directory.contractors(db, workspaceId, [contractorId]),
        departmentId == null
          ? new Map<string, WorksheetNamedFacts>()
          : directory.departments(db, workspaceId, [departmentId]),
        workTypeId == null
          ? ([] as WorksheetWorkTypeFacts[])
          : directory.workTypes(db, workspaceId, { ids: [workTypeId] }),
        unitId == null
          ? ([] as WorksheetNamedFacts[])
          : directory.units(db, workspaceId, [unitId]),
        directory.materials(
          db,
          workspaceId,
          (input.materials ?? []).map((line) => line.materialId),
        ),
        // Only asked when a shown Location section came back empty.
        needsPlaces
          ? directory.hasPlaces(workspaceId, projectId)
          : Promise.resolve(true),
      ]);
    const contractor =
      contractorId == null ? null : contractors.get(contractorId);
    const department =
      departmentId == null ? null : departments.get(departmentId);
    const workType = workTypes[0];
    const unit = units[0];
    return {
      contractor:
        contractor == null
          ? null
          : {
              id: contractor.id,
              isActive: contractor.isActive,
              onProject: contractor.projectIds.includes(projectId),
              departmentIds: contractor.departmentIds,
            },
      department:
        department == null
          ? null
          : { id: department.id, disabled: department.disabled },
      workType:
        workType == null
          ? null
          : {
              id: workType.id,
              departmentId: workType.departmentId,
              disabled: workType.disabled,
            },
      unit: unit == null ? null : { id: unit.id, disabled: unit.disabled },
      placesOffered: places,
      materials: new Map(
        [...materials.values()].map((material) => [
          material.id,
          {
            id: material.id,
            name: material.name,
            unitName: material.unitName,
            disabled: material.disabled,
          },
        ]),
      ),
    };
  }

  /** Validates the command against the Project's settings and the masters. */
  private async content(
    access: MemberAccess,
    projectId: string,
    input: WorksheetCommand,
    settings: WorksheetSettings,
    previous: WorksheetContent | null,
  ): Promise<WorksheetContent> {
    const sheetDate = assertCalendarDate(input.sheetDate, "SHEET_DATE_INVALID");
    assertSheetDateNotFuture(
      sheetDate,
      await this.deps.today(access.workspaceId),
    );
    const facts = await this.facts(
      access.workspaceId,
      projectId,
      input,
      settings.showLocation && input.siteLocation == null,
    );
    // A hidden Location section is neither validated nor stored.
    const siteLocation =
      settings.showLocation && input.siteLocation != null
        ? locationRef(input.siteLocation)
        : null;
    const content = worksheetContent(
      { ...input, sheetDate, siteLocation },
      settings,
      facts,
      previous,
    );
    if (
      settings.showLocation &&
      content.siteLocation != null &&
      !sameLocation(content.siteLocation, previous?.siteLocation ?? null)
    )
      await this.deps.locations.assertOnProject(
        access.workspaceId,
        projectId,
        content.siteLocation,
      );
    return content;
  }

  /**
   * The sheet's Task: the one the command names (checked when it is new or
   * changed: a live leaf task of the Project), or the sheet's own.
   */
  private async taskOf(
    workspaceId: string,
    projectId: string,
    input: WorksheetCommand,
    previous: string | null,
  ): Promise<string | null> {
    if (input.taskId === undefined) return previous;
    const raw = input.taskId?.trim().toLowerCase() ?? "";
    if (raw === "") return null;
    if (raw === previous) return raw;
    const task = (
      await this.deps.tasks.tasks(this.deps.db, workspaceId, [raw])
    ).get(raw);
    return assertWorksheetTask(task, projectId).id;
  }

  /**
   * Checks a newly named task again inside the sheet's transaction, under a
   * share lock (CM-806): it may have gained a sub-task since `taskOf` read
   * it, and nobody can add one now until this sheet commits.
   */
  private async lockTask(
    tx: Db,
    workspaceId: string,
    projectId: string,
    taskId: string,
  ): Promise<void> {
    assertWorksheetTask(
      await this.deps.tasks.lockTask(tx, workspaceId, taskId),
      projectId,
    );
  }

  /**
   * Makes the task progress match the sheet (CM-0019 §6): a leaf task in
   * the sheet's unit gets its Approx Work Done while the sheet is not
   * rejected; otherwise its update, if any, goes.
   */
  private async syncTask(
    tx: Db,
    sheet: {
      id: string;
      workspaceId: string;
      number: string;
      taskId: string | null;
      sheetDate: CalendarDate;
      approxWorkQty: string | null;
      approxWorkUnitId: string | null;
      approval: { status: SheetApprovalStatus };
    },
    by: string,
    at: Date,
  ): Promise<void> {
    const { tasks } = this.deps;
    const task =
      sheet.taskId == null
        ? null
        : ((await tasks.tasks(tx, sheet.workspaceId, [sheet.taskId])).get(
            sheet.taskId,
          ) ?? null);
    const posts = worksheetPostsProgress(task, {
      approxWorkQty: sheet.approxWorkQty,
      approxWorkUnitId: sheet.approxWorkUnitId,
      approvalStatus: sheet.approval.status,
    });
    if (posts && task != null && sheet.approxWorkQty != null)
      await tasks.post(tx, {
        workspaceId: sheet.workspaceId,
        worksheetId: sheet.id,
        worksheetNumber: sheet.number,
        taskId: task.id,
        date: sheet.sheetDate,
        quantity: sheet.approxWorkQty,
        by,
        at,
      });
    else
      await tasks.remove(tx, {
        workspaceId: sheet.workspaceId,
        worksheetId: sheet.id,
        by,
        at,
      });
  }

  private posting(
    access: MemberAccess,
    projectId: string,
    number: string,
    row: WorksheetRow,
  ) {
    return {
      workspaceId: access.workspaceId,
      by: access.userId,
      projectId,
      date: row.sheetDate,
      siteLocation: row.siteLocation,
      label: `Consumed by ${number}`,
      lines: row.lines.map((line) => ({
        lineId: line.id,
        materialId: line.materialId,
        materialName: line.materialName,
        quantity: line.quantity,
      })),
    };
  }

  /**
   * The approval events of saved or decided sheets, after commit (ADR
   * CM-0021 §6): `document.submitted` when a sheet waits for approval,
   * `document.approved` / `document.rejected` when it is decided.
   */
  private async dispatchApproval(
    sheets: readonly Pick<
      StoredWorksheet,
      "id" | "workspaceId" | "projectId" | "number" | "createdBy"
    >[],
    outcome: ApprovalOutcome | null,
    by: string,
    at: Date,
  ) {
    if (outcome == null || sheets.length === 0) return;
    await this.deps.events.dispatch(
      sheets.map((sheet) =>
        approvalEvent(
          {
            workspaceId: sheet.workspaceId,
            documentType: DOCUMENT.type,
            documentId: sheet.id,
            projectId: sheet.projectId,
            number: sheet.number,
            createdBy: sheet.createdBy,
          },
          outcome,
          by,
          at,
        ),
      ),
    );
  }

  /**
   * Saves a new sheet: Save, or Save & Approve (needs Approve). The
   * number comes from the WS rule, the date from the back-dated policy,
   * and each material line posts Consumed stock at the Project (409
   * `STOCK_INSUFFICIENT` refuses the whole save).
   */
  async create(
    access: MemberAccess,
    input: WorksheetCommand & {
      projectId: string;
      duplicatedFromId?: string | null;
    },
  ): Promise<string> {
    const scope = { projectId: input.projectId };
    assertCan(access, MENU, "create", scope);
    if (input.approve === true) assertCan(access, MENU, "approve", scope);
    const { db, store, stock } = this.deps;
    const projectName = await this.deps.directory.projectName(
      db,
      access.workspaceId,
      input.projectId,
    );
    if (projectName == null)
      throw new DomainError(
        "PROJECT_NOT_FOUND",
        "This Project was not found.",
        {
          details: { field: "projectId" },
        },
      );
    const settings = await this.deps.settings.get(
      access.workspaceId,
      input.projectId,
    );
    const content = await this.content(
      access,
      input.projectId,
      input,
      settings,
      null,
    );
    const taskId = await this.taskOf(
      access.workspaceId,
      input.projectId,
      input,
      null,
    );
    let duplicatedFromId: string | null = null;
    if (input.duplicatedFromId != null) {
      const source = await store.find(
        db,
        access.workspaceId,
        input.duplicatedFromId,
      );
      if (source?.projectId === input.projectId) duplicatedFromId = source.id;
    }
    const check = await this.deps.backdated(access);
    const id = newId();
    const at = this.clock();
    const approval = savedApproval(
      settings.approvalEnabled,
      input.approve === true,
      {
        userId: access.userId,
        at,
      },
    );
    const row: WorksheetRow = {
      ...content,
      lines: withLineIds(content.lines),
      taskId,
    };
    const { events, number } = await db.$transaction(async (tx) => {
      check(DOCUMENT.backdated, "create", content.sheetDate);
      if (taskId != null)
        await this.lockTask(tx, access.workspaceId, input.projectId, taskId);
      const { number } = await nextSequenceNumber(tx, {
        workspaceId: access.workspaceId,
        module: "daily_worksheet",
        projectId: input.projectId,
        date: content.sheetDate,
        by: access.userId,
      });
      await store.insert(tx, {
        ...row,
        id,
        workspaceId: access.workspaceId,
        projectId: input.projectId,
        number,
        approval,
        duplicatedFromId,
        by: access.userId,
        at,
      });
      await this.syncTask(
        tx,
        { ...row, id, workspaceId: access.workspaceId, number, approval },
        access.userId,
        at,
      );
      const posted =
        row.lines.length === 0
          ? { events: [] }
          : await stock.replace(
              tx,
              { type: STOCK_SOURCE, id },
              this.posting(access, input.projectId, number, row),
            );
      await recordAudit(tx, {
        workspaceId: access.workspaceId,
        actorUserId: access.userId,
        action: "worksheet.created",
        entityType: "worksheet",
        entityId: id,
        after: { number, duplicatedFromId, ...snapshot({ ...row, approval }) },
        occurredAt: at,
      });
      return { ...posted, number };
    });
    await stock.dispatch(events);
    await this.dispatchApproval(
      [
        {
          id,
          workspaceId: access.workspaceId,
          projectId: input.projectId,
          number,
          createdBy: access.userId,
        },
      ],
      savedOutcome(approval.status),
      access.userId,
      at,
    );
    return id;
  }

  /**
   * Edits a sheet under the Project's current settings (CM-0016 §2, §3):
   * its postings are replaced (reversal plus new entries, checked
   * together), and it goes back to pending with approval on (approved
   * with Save & Approve), or `not_required` with approval off.
   */
  async edit(
    access: MemberAccess,
    id: string,
    expectedUpdatedAt: Date,
    input: WorksheetCommand,
  ): Promise<void> {
    const { db, store, stock } = this.deps;
    const current = await this.find(access.workspaceId, id);
    const scope = { projectId: current.projectId };
    assertCan(access, MENU, "update", scope);
    if (input.approve === true) assertCan(access, MENU, "approve", scope);
    const settings = await this.deps.settings.get(
      access.workspaceId,
      current.projectId,
    );
    const content = await this.content(
      access,
      current.projectId,
      input,
      settings,
      contentOf(current),
    );
    const taskId = await this.taskOf(
      access.workspaceId,
      current.projectId,
      input,
      current.taskId,
    );
    const check = await this.deps.backdated(access);
    const at = this.clock();
    const approval = savedApproval(
      settings.approvalEnabled,
      input.approve === true,
      {
        userId: access.userId,
        at,
      },
    );
    const row: WorksheetRow = {
      ...content,
      lines: withLineIds(content.lines),
      taskId,
    };
    const { events } = await db.$transaction(async (tx) => {
      const [locked] = await store.lock(tx, access.workspaceId, [id]);
      if (locked == null) throw worksheetNotFound();
      changed(locked, expectedUpdatedAt);
      check(DOCUMENT.backdated, "edit", locked.sheetDate);
      if (content.sheetDate !== locked.sheetDate)
        check(DOCUMENT.backdated, "edit", content.sheetDate);
      if (taskId != null && taskId !== locked.taskId)
        await this.lockTask(tx, access.workspaceId, current.projectId, taskId);
      await store.replace(tx, id, { ...row, approval, by: access.userId, at });
      await this.syncTask(
        tx,
        {
          ...row,
          id,
          workspaceId: access.workspaceId,
          number: locked.number,
          approval,
        },
        access.userId,
        at,
      );
      const posted = await stock.replace(
        tx,
        { type: STOCK_SOURCE, id },
        this.posting(access, locked.projectId, locked.number, row),
      );
      await recordAudit(tx, {
        workspaceId: access.workspaceId,
        actorUserId: access.userId,
        action: "worksheet.updated",
        entityType: "worksheet",
        entityId: id,
        before: snapshot(locked),
        after: snapshot({ ...row, approval }),
        occurredAt: at,
      });
      return posted;
    });
    await stock.dispatch(events);
    await this.dispatchApproval(
      [current],
      savedOutcome(approval.status),
      access.userId,
      at,
    );
  }

  /** Deletes a sheet: a tombstone, and its stock postings reversed. */
  async delete(
    access: MemberAccess,
    id: string,
    expectedUpdatedAt: Date,
  ): Promise<void> {
    const { db, store, stock } = this.deps;
    const current = await this.find(access.workspaceId, id);
    assertCan(access, MENU, "delete", { projectId: current.projectId });
    const check = await this.deps.backdated(access);
    const at = this.clock();
    const { events } = await db.$transaction(async (tx) => {
      const [locked] = await store.lock(tx, access.workspaceId, [id]);
      if (locked == null) throw worksheetNotFound();
      changed(locked, expectedUpdatedAt);
      check(DOCUMENT.backdated, "edit", locked.sheetDate);
      await store.tombstone(tx, id, access.userId, at);
      await this.deps.tasks.remove(tx, {
        workspaceId: access.workspaceId,
        worksheetId: id,
        by: access.userId,
        at,
      });
      const reversed = await stock.reverse(
        tx,
        { type: STOCK_SOURCE, id },
        { workspaceId: access.workspaceId, by: access.userId },
      );
      await recordAudit(tx, {
        workspaceId: access.workspaceId,
        actorUserId: access.userId,
        action: "worksheet.deleted",
        entityType: "worksheet",
        entityId: id,
        before: { number: locked.number, ...snapshot(locked) },
        occurredAt: at,
      });
      return reversed;
    });
    await stock.dispatch(events);
    const removed = siteWorkDocumentMediaRemoved({
      workspaceId: access.workspaceId,
      projectId: current.projectId,
      type: DOCUMENT.type,
      documentId: id,
      at,
    });
    await removeFromGallery(this.deps.media, removed);
  }

  /** Approve or reject one (409 `WORKSHEET_NOT_PENDING` when not pending). */
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
    // One reason for all: a missing one is the request's fault, not each sheet's.
    const checked = decision.approve
      ? decision
      : {
          approve: false as const,
          reason: requiredText(
            decision.reason,
            "REJECTION_REASON_REQUIRED",
            "reason",
          ),
        };
    await this.decideMany(access, projectId, unique, checked, true);
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
    const decidedSheets: StoredWorksheet[] = [];
    await db.$transaction(async (tx) => {
      const locked = new Map(
        (await store.lock(tx, access.workspaceId, ids)).map((sheet) => [
          sheet.id,
          sheet,
        ]),
      );
      const refusals: BulkRefusal[] = [];
      const next = new Map<string, WorksheetApproval>();
      for (const id of ids) {
        const sheet = locked.get(id);
        if (sheet?.projectId !== projectId) {
          if (!bulk) throw worksheetNotFound();
          refusals.push({
            id,
            code: "WORKSHEET_NOT_FOUND",
            message: "This Daily Worksheet was not found.",
          });
          continue;
        }
        if (!bulk) changed(sheet, expectedUpdatedAt);
        try {
          next.set(id, decideWorksheet(sheet.approval, decision, by));
        } catch (error) {
          if (!bulk || !(error instanceof DomainError)) throw error;
          refusals.push({ id, code: error.code, message: error.message });
        }
      }
      if (refusals.length > 0) throw bulkRefused(refusals);
      for (const [id, approval] of next) {
        await store.setApproval(tx, id, approval, access.userId, at);
        const decided = locked.get(id);
        if (decided != null)
          await this.syncTask(tx, { ...decided, approval }, access.userId, at);
        await recordAudit(tx, {
          workspaceId: access.workspaceId,
          actorUserId: access.userId,
          action: decision.approve
            ? "worksheet.approved"
            : "worksheet.rejected",
          entityType: "worksheet",
          entityId: id,
          after: {
            approvalStatus: approval.status,
            rejectionReason: approval.rejectionReason,
            bulk,
          },
          occurredAt: at,
        });
        const sheet = locked.get(id);
        if (sheet != null) decidedSheets.push(sheet);
      }
    });
    await this.dispatchApproval(
      decidedSheets,
      decision.approve
        ? { kind: "approved" }
        : { kind: "rejected", reason: decision.reason.trim() },
      access.userId,
      at,
    );
  }

  // -------------------------------------------------------------------------
  // Reads
  // -------------------------------------------------------------------------

  async find(workspaceId: string, id: string): Promise<StoredWorksheet> {
    const sheet = await this.deps.store.find(this.deps.db, workspaceId, id);
    if (sheet == null) throw worksheetNotFound();
    return sheet;
  }

  private async readModels(
    workspaceId: string,
    rows: readonly StoredWorksheet[],
  ): Promise<WorksheetReadModel[]> {
    const { db, directory } = this.deps;
    const ids = (pick: (row: StoredWorksheet) => string | null) => [
      ...new Set(rows.map(pick).filter((id): id is string => id != null)),
    ];
    const userIds = new Set<string>();
    for (const row of rows) {
      userIds.add(row.createdBy);
      if (row.approval.decidedBy != null) userIds.add(row.approval.decidedBy);
    }
    const [contractors, departments, workTypes, units, names, tasks] =
      await Promise.all([
        directory.contractors(
          db,
          workspaceId,
          ids((row) => row.contractorId),
        ),
        directory.departments(
          db,
          workspaceId,
          ids((row) => row.departmentId),
        ),
        directory.workTypes(db, workspaceId, {
          ids: ids((row) => row.workTypeId),
        }),
        directory.units(
          db,
          workspaceId,
          ids((row) => row.approxWorkUnitId),
        ),
        directory.memberNames(db, workspaceId, [...userIds]),
        this.deps.tasks.tasks(
          db,
          workspaceId,
          ids((row) => row.taskId),
        ),
      ]);
    const workTypeNames = new Map(workTypes.map((row) => [row.id, row.name]));
    const unitNames = new Map(units.map((row) => [row.id, row.name]));
    return rows.map((row) => ({
      ...row,
      task: (() => {
        if (row.taskId == null) return null;
        const task = tasks.get(row.taskId);
        return task == null
          ? {
              id: row.taskId,
              taskNo: null,
              name: null,
              unitId: null,
              unitName: null,
              posting: null,
            }
          : {
              id: task.id,
              taskNo: task.taskNo,
              name: task.name,
              unitId: task.unitId,
              unitName: task.unitName,
              posting: worksheetTaskPosting(task, row),
            };
      })(),
      contractorName: contractors.get(row.contractorId)?.name ?? null,
      departmentName: departments.get(row.departmentId)?.name ?? null,
      workTypeName:
        row.workTypeId == null
          ? null
          : (workTypeNames.get(row.workTypeId) ?? null),
      approxWorkUnitName:
        row.approxWorkUnitId == null
          ? null
          : (unitNames.get(row.approxWorkUnitId) ?? null),
      createdByName: names.get(row.createdBy) ?? null,
      decidedByName:
        row.approval.decidedBy == null
          ? null
          : (names.get(row.approval.decidedBy) ?? null),
    }));
  }

  /** One sheet with the names of everything it points at. */
  async get(workspaceId: string, id: string): Promise<WorksheetReadModel> {
    const sheet = await this.find(workspaceId, id);
    const [model] = await this.readModels(workspaceId, [sheet]);
    if (model == null) throw worksheetNotFound();
    return model;
  }

  /**
   * A Project's sheets, newest first, filtered by date range, Filled By,
   * Contractor, Department and approval status, with the filter options.
   */
  async list(params: WorksheetListParams) {
    const { db, store, directory } = this.deps;
    const [page, facets] = await Promise.all([
      store.list(db, params),
      store.facets(db, params.workspaceId, params.projectId),
    ]);
    const [items, names, contractors, departments] = await Promise.all([
      this.readModels(params.workspaceId, page.items),
      directory.memberNames(db, params.workspaceId, facets.createdBy),
      directory.contractors(db, params.workspaceId, facets.contractorIds),
      directory.departments(db, params.workspaceId, facets.departmentIds),
    ]);
    const byName = (a: { name: string }, b: { name: string }) =>
      a.name.localeCompare(b.name);
    return {
      ...page,
      items,
      facets: {
        filledBy: facets.createdBy
          .map((userId) => ({ userId, name: names.get(userId) ?? "Unknown" }))
          .sort(byName),
        contractors: [...contractors.values()]
          .map(({ id, name }) => ({ id, name }))
          .sort(byName),
        departments: [...departments.values()]
          .map(({ id, name }) => ({ id, name }))
          .sort(byName),
      },
    };
  }

  /**
   * What the form offers on a Project: its settings, the active
   * Contractors on it with their enabled Departments, those Departments'
   * enabled Work Types (with assigned Materials) and the units.
   */
  async formOptions(
    workspaceId: string,
    projectId: string,
  ): Promise<WorksheetFormOptions> {
    const { db, directory } = this.deps;
    const [settings, onProject, units] = await Promise.all([
      this.deps.settings.get(workspaceId, projectId),
      directory.contractorsOnProject(db, workspaceId, projectId),
      directory.units(db, workspaceId, null),
    ]);
    const active = onProject.filter((contractor) => contractor.isActive);
    const departmentIds = [
      ...new Set(active.flatMap((contractor) => contractor.departmentIds)),
    ];
    const [departments, workTypes] = await Promise.all([
      directory.departments(db, workspaceId, departmentIds),
      directory.workTypes(db, workspaceId, { departmentIds }),
    ]);
    const enabled = new Map(
      [...departments.values()]
        .filter((department) => !department.disabled)
        .map((department) => [department.id, department.name]),
    );
    const byName = (a: { name: string }, b: { name: string }) =>
      a.name.localeCompare(b.name);
    return {
      settings: { ...settings, updatedAt: settings.updatedAt },
      contractors: active
        .map((contractor) => ({
          id: contractor.id,
          name: contractor.name,
          departmentIds: contractor.departmentIds.filter((id) =>
            enabled.has(id),
          ),
        }))
        .sort(byName),
      departments: [...enabled]
        .map(([id, name]) => ({ id, name }))
        .sort(byName),
      workTypes: workTypes
        .filter((workType) => !workType.disabled)
        .map((workType) => ({
          id: workType.id,
          name: workType.name,
          departmentId: workType.departmentId,
          materialIds: [...workType.materialIds],
        }))
        .sort(byName),
      units: units
        .filter((unit) => !unit.disabled)
        .map(({ id, name }) => ({ id, name }))
        .sort(byName),
    };
  }

  /**
   * The "Attendance on <date>" panel (CM-0016 §6): the Project's
   * attendance by skill, the heads on its other live worksheets that date
   * (leaving out `excludeId`, the sheet being edited) and what remains.
   */
  async prefill(
    workspaceId: string,
    projectId: string,
    date: CalendarDate,
    excludeId: string | null,
  ): Promise<LabourPrefill> {
    const { db, store, attendance } = this.deps;
    const [rows, onWorksheets] = await Promise.all([
      attendance.onDate(db, workspaceId, projectId, date),
      store.headcounts(db, workspaceId, projectId, date, excludeId),
    ]);
    return labourPrefill(attendanceHeadcount(rows), onWorksheets);
  }

  /** The Task picker (CM-806): live leaf tasks of the Project, searched. */
  async taskOptions(
    workspaceId: string,
    projectId: string,
    search: string | null,
  ) {
    return this.deps.tasks.options(
      this.deps.db,
      workspaceId,
      projectId,
      search,
      50,
    );
  }

  /**
   * Stock per material at the Project on a date (decimal strings, zero
   * when none). When editing, the sheet's own lines are added back if it
   * was dated on or before that date, so the form shows what it may use.
   */
  async availableStock(
    workspaceId: string,
    projectId: string,
    date: CalendarDate,
    materialIds: readonly string[],
    excludeId: string | null,
  ): Promise<Map<string, string>> {
    const ids = [...new Set(materialIds)];
    const stock = await this.deps.stock.available(
      workspaceId,
      projectId,
      ids,
      date,
    );
    const own =
      excludeId == null
        ? null
        : await this.deps.store.find(this.deps.db, workspaceId, excludeId);
    const result = new Map<string, string>();
    for (const materialId of ids) {
      let quantity = Quantity.of(stock.get(materialId) ?? "0", "stock");
      if (own?.projectId === projectId && own.sheetDate <= date)
        for (const line of own.lines)
          if (line.materialId === materialId)
            quantity = quantity.add(Quantity.of(line.quantity, "stock"));
      result.set(materialId, quantity.toDecimalString());
    }
    return result;
  }
}
