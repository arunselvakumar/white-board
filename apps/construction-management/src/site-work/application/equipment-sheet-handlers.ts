import type { Prisma } from "@repo/construction-db";

import { assertCan, can, type MemberAccess } from "@/src/shared-kernel/access";
import {
  bulkIds,
  bulkRefused,
  requiredText,
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
import type {
  EquipmentOwnership,
  UtilisationBasis,
  WorkingTimeMethod,
} from "../domain/equipment";
import {
  equipmentSheetBlocked,
  equipmentSheetBlocker,
} from "../domain/equipment-lifecycle";
import {
  accruesHire,
  assertSheetDateNotFuture,
  decideEquipmentSheet,
  equipmentSheetContent,
  equipmentSheetExists,
  savedApproval,
  type EquipmentSheetApproval,
  type EquipmentSheetContent,
  type EquipmentSheetFacts,
  type EquipmentSheetInput,
  type EquipmentSheetSettings,
  type SheetEquipmentFacts,
  type TimeShiftInput,
} from "../domain/equipment-usage";
import type {
  EquipmentFuelOverrun,
  EquipmentHireAccrualVoided,
  EquipmentHireAccrued,
} from "../domain/events";
import type { SheetApprovalStatus } from "../domain/shift";
import { SITE_WORK_DOCUMENTS } from "../domain/site-work-documents";
import type { WorksheetLine, WorksheetLineInput } from "../domain/worksheet";
import type { EquipmentStore, StoredEquipment } from "./equipment-handlers";
import type { EquipmentSheetSettingsHandlers } from "./equipment-sheet-settings-handlers";
import type {
  SiteRecordDirectory,
  SiteStock,
  WorksheetContractorFacts,
  WorksheetDirectory,
  WorksheetNamedFacts,
} from "./ports";

type Db = Prisma.TransactionClient;

const DOCUMENT = SITE_WORK_DOCUMENTS.equipment_usage;
const MENU = DOCUMENT.menu;
/** The stock ledger's source type for usage-sheet lines (CM-0016 §5). */
const STOCK_SOURCE = "equipment_usage" as const;

/** Checks one entry date against the Back-dated Entry policy (CM-113). */
export type BackdatedCheck = (
  module: typeof DOCUMENT.backdated,
  action: "create" | "edit",
  date: CalendarDate,
) => void;

export const equipmentSheetNotFound = () =>
  notFound(
    "EQUIPMENT_SHEET_NOT_FOUND",
    "This Equipment Usage sheet was not found.",
  );

const equipmentNotFound = () =>
  new DomainError("EQUIPMENT_NOT_FOUND", "This equipment was not found.", {
    details: { field: "equipmentId" },
  });

// ---------------------------------------------------------------------------
// The store port (Prisma in `infrastructure/prisma-equipment-sheet-store`)
// ---------------------------------------------------------------------------

export type StoredSheetLine = WorksheetLine & { id: string };

export type StoredEquipmentSheet = Omit<EquipmentSheetContent, "lines"> & {
  id: string;
  workspaceId: string;
  projectId: string;
  number: string;
  equipmentId: string;
  /** Copied from the equipment at save. */
  ownership: EquipmentOwnership;
  utilisationBasis: UtilisationBasis;
  workingTimeMethod: WorkingTimeMethod;
  approval: EquipmentSheetApproval;
  duplicatedFromId: string | null;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
  updatedBy: string;
  lines: StoredSheetLine[];
};

/** What a save writes besides number, approval and bookkeeping. */
export type EquipmentSheetRow = Omit<EquipmentSheetContent, "lines"> & {
  lines: StoredSheetLine[];
};

export type EquipmentSheetListParams = {
  workspaceId: string;
  projectId: string;
  from?: CalendarDate;
  to?: CalendarDate;
  equipmentId?: string;
  ownership?: EquipmentOwnership;
  createdBy?: string;
  approvalStatus?: SheetApprovalStatus;
  limit: number;
  after?: ListCursor;
  before?: ListCursor;
};

/** Sums over every sheet the list's filters match (decimal strings). */
export type EquipmentSheetTotals = {
  usageHours: string;
  distanceKm: string;
  trips: number;
  idleHours: string;
  breakdownHours: string;
};

/** What a sheet shows of its equipment (deleted equipment too). */
export type SheetEquipmentSummary = {
  id: string;
  name: string;
  equipmentNumber: string;
  fuelUnit: StoredEquipment["fuelUnit"];
  expectedFuelEfficiency: string | null;
  hirePartyId: string | null;
  hireBasis: StoredEquipment["hireBasis"];
  hireRate: bigint | null;
  idleChargeable: boolean;
};

export type EquipmentSheetStore = {
  find(
    db: Db,
    workspaceId: string,
    id: string,
  ): Promise<StoredEquipmentSheet | null>;
  /** Locks the rows `FOR UPDATE` (in id order) and reads them. */
  lock(
    db: Db,
    workspaceId: string,
    ids: readonly string[],
  ): Promise<StoredEquipmentSheet[]>;
  /** 409 `EQUIPMENT_SHEET_EXISTS` when the live-shift index refuses it. */
  insert(
    db: Db,
    row: EquipmentSheetRow & {
      id: string;
      workspaceId: string;
      projectId: string;
      number: string;
      equipmentId: string;
      ownership: EquipmentOwnership;
      utilisationBasis: UtilisationBasis;
      workingTimeMethod: WorkingTimeMethod;
      approval: EquipmentSheetApproval;
      duplicatedFromId: string | null;
      by: string;
      at: Date;
    },
  ): Promise<void>;
  replace(
    db: Db,
    id: string,
    row: EquipmentSheetRow & {
      approval: EquipmentSheetApproval;
      by: string;
      at: Date;
    },
  ): Promise<void>;
  setApproval(
    db: Db,
    id: string,
    approval: EquipmentSheetApproval,
    by: string,
    at: Date,
  ): Promise<void>;
  tombstone(db: Db, id: string, by: string, at: Date): Promise<void>;
  /** A live sheet of the equipment on that date and shift, other than `exceptId`. */
  taken(
    db: Db,
    equipmentId: string,
    date: CalendarDate,
    shift: string,
    exceptId: string | null,
  ): Promise<boolean>;
  /**
   * The closing reading of the equipment's latest live sheet before this
   * date and shift (by date, then shift), other than `exceptId`.
   */
  previousClosing(
    db: Db,
    equipmentId: string,
    date: CalendarDate,
    shift: string,
    exceptId: string | null,
  ): Promise<{ reading: string; sheetDate: CalendarDate } | null>;
  list(
    db: Db,
    params: EquipmentSheetListParams,
  ): Promise<{
    items: StoredEquipmentSheet[];
    hasMore: boolean;
    total: number;
    totals: EquipmentSheetTotals;
  }>;
  /** Who filled and which equipment: the Project's live sheets. */
  facets(
    db: Db,
    workspaceId: string,
    projectId: string,
  ): Promise<{ createdBy: string[]; equipmentIds: string[] }>;
  equipment(
    db: Db,
    workspaceId: string,
    ids: readonly string[],
  ): Promise<Map<string, SheetEquipmentSummary>>;
};

/** The equipment register as the sheets read it (CM-603 / CM-605). */
export type SheetEquipmentRegister = Pick<
  EquipmentStore,
  "find" | "lock" | "lifecycleFacts"
>;

export type EquipmentSheetDeps = {
  db: Db & { $transaction<T>(fn: (tx: Db) => Promise<T>): Promise<T> };
  store: EquipmentSheetStore;
  settings: EquipmentSheetSettingsHandlers;
  register: SheetEquipmentRegister;
  /** Contractors, Departments, units, Materials, Project and member names. */
  directory: WorksheetDirectory;
  /** Who may supervise on the Project (Team Members on it, the Owner). */
  team: Pick<SiteRecordDirectory, "projectTeamMembers">;
  locations: LocationResolver;
  stock: SiteStock;
  backdated: (actor: MemberAccess) => Promise<BackdatedCheck>;
  today: (workspaceId: string) => Promise<CalendarDate>;
  /** `document.approved`, `EquipmentHireAccrued`, `EquipmentFuelOverrun`. */
  events: EventDispatcher;
  /** `ProjectMediaRemoved` for the sheet's images on delete (ADR CM-0014). */
  media: EventDispatcher;
  clock?: () => Date;
};

// ---------------------------------------------------------------------------
// Inputs and read models
// ---------------------------------------------------------------------------

export type EquipmentSheetCommand = Omit<
  EquipmentSheetInput,
  "sheetDate" | "siteLocation" | "timeShifts" | "materials"
> & {
  sheetDate: string;
  siteLocation?: LocationRefInput | null;
  timeShifts?: readonly TimeShiftInput[];
  materials?: readonly WorksheetLineInput[];
  /** Save & Approve: needs Approve, and only means something with approval on. */
  approve?: boolean;
};

export type EquipmentSheetActions = {
  edit: boolean;
  delete: boolean;
  approve: boolean;
  reject: boolean;
  duplicate: boolean;
};

export type EquipmentSheetReadModel = StoredEquipmentSheet & {
  equipment: SheetEquipmentSummary & { hirePartyName: string | null };
  contractorName: string | null;
  departmentName: string | null;
  approxWorkUnitName: string | null;
  supervisorName: string | null;
  createdByName: string | null;
  decidedByName: string | null;
};

export type EquipmentSheetDetail = EquipmentSheetReadModel & {
  /** The equipment's previous closing reading, for the gap. */
  previousClosing: { reading: string; sheetDate: CalendarDate } | null;
};

export type EquipmentSheetFormOptions = {
  settings: EquipmentSheetSettings & { updatedAt: Date | null };
  /** Active Team Members on the Project, and the Owner. */
  supervisors: { userId: string; name: string }[];
  /** Active Contractors on the Project, each with its enabled Departments. */
  contractors: { id: string; name: string; departmentIds: string[] }[];
  departments: { id: string; name: string }[];
  /** Enabled Measurement Units (Approx Work Done). */
  units: { id: string; name: string }[];
};

/** What the caller may do with a sheet now (screens hide the rest). */
export function equipmentSheetActions(
  access: MemberAccess,
  sheet: { projectId: string; approval: { status: SheetApprovalStatus } },
): EquipmentSheetActions {
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

/** Unit rate, billable quantity and hire cost: Financial on its Project. */
export function seesSheetMoney(access: MemberAccess, projectId: string) {
  return can(access, MENU, "financial", { projectId });
}

/** What the audit log keeps of a sheet. */
function snapshot(
  sheet: Omit<EquipmentSheetRow, "lines"> & {
    lines: readonly { materialId: string; quantity: string }[];
    approval?: EquipmentSheetApproval;
  },
) {
  return {
    sheetDate: sheet.sheetDate,
    shift: sheet.shift,
    operatorName: sheet.operatorName,
    supervisorUserId: sheet.supervisorUserId,
    contractorId: sheet.contractorId,
    departmentId: sheet.departmentId,
    workItem: sheet.workItem,
    siteLocation: sheet.siteLocation,
    timeShifts: sheet.timeShifts.map(({ startTime, endTime }) => ({
      startTime,
      endTime,
    })),
    openingReading: sheet.openingReading,
    closingReading: sheet.closingReading,
    usageHours: sheet.usageHours,
    distanceKm: sheet.distanceKm,
    trips: sheet.trips,
    idleHours: sheet.idleHours,
    breakdownHours: sheet.breakdownHours,
    approxWorkQty: sheet.approxWorkQty,
    approxWorkUnitId: sheet.approxWorkUnitId,
    fuelQty: sheet.fuelQty,
    fuelBorneBy: sheet.fuelBorneBy,
    fuelOverrun: sheet.fuelOverrun,
    unitRate: sheet.unitRate?.toString() ?? null,
    billableQty: sheet.billableQty,
    hireCost: sheet.hireCost?.toString() ?? null,
    remark: sheet.remark,
    approvalStatus: sheet.approval?.status,
    materials: sheet.lines.map((line) => ({
      materialId: line.materialId,
      quantity: line.quantity,
    })),
  };
}

function changed(
  sheet: StoredEquipmentSheet,
  expectedUpdatedAt: Date | undefined,
) {
  if (
    expectedUpdatedAt != null &&
    sheet.updatedAt.getTime() !== expectedUpdatedAt.getTime()
  )
    throw conflict(
      "EQUIPMENT_SHEET_CHANGED",
      "Someone changed this Equipment Usage sheet. Reload it and try again.",
      { updatedAt: sheet.updatedAt.toISOString() },
    );
}

function contentOf(sheet: StoredEquipmentSheet): EquipmentSheetContent {
  return {
    sheetDate: sheet.sheetDate,
    shift: sheet.shift,
    operatorName: sheet.operatorName,
    supervisorUserId: sheet.supervisorUserId,
    contractorId: sheet.contractorId,
    departmentId: sheet.departmentId,
    workItem: sheet.workItem,
    siteLocation: sheet.siteLocation,
    timeShifts: sheet.timeShifts.map((shift) => ({ ...shift })),
    openingReading: sheet.openingReading,
    closingReading: sheet.closingReading,
    usageHours: sheet.usageHours,
    distanceKm: sheet.distanceKm,
    trips: sheet.trips,
    idleHours: sheet.idleHours,
    breakdownHours: sheet.breakdownHours,
    approxWorkQty: sheet.approxWorkQty,
    approxWorkUnitId: sheet.approxWorkUnitId,
    fuelQty: sheet.fuelQty,
    fuelBorneBy: sheet.fuelBorneBy,
    fuelOverrun: sheet.fuelOverrun,
    unitRate: sheet.unitRate,
    billableQty: sheet.billableQty,
    hireCost: sheet.hireCost,
    remark: sheet.remark,
    lines: sheet.lines.map(({ id: _id, ...line }) => line),
  };
}

function sameLocation(a: LocationRef | null, b: LocationRef | null): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** The equipment as the content rules read it; the sheet keeps its copies. */
function equipmentFacts(
  equipment: StoredEquipment,
  copied?: {
    ownership: EquipmentOwnership;
    utilisationBasis: UtilisationBasis;
    workingTimeMethod: WorkingTimeMethod;
  },
): SheetEquipmentFacts {
  const ownership = copied?.ownership ?? equipment.ownership;
  return {
    id: equipment.id,
    ownership,
    utilisationBasis: copied?.utilisationBasis ?? equipment.utilisationBasis,
    workingTimeMethod: copied?.workingTimeMethod ?? equipment.workingTimeMethod,
    fuelUnit: equipment.fuelUnit,
    expectedFuelEfficiency: equipment.expectedFuelEfficiency,
    hire:
      ownership === "rented" &&
      equipment.hireBasis != null &&
      equipment.hireRate != null
        ? {
            hireBasis: equipment.hireBasis,
            hireRate: equipment.hireRate,
            idleChargeable: equipment.idleChargeable,
          }
        : null,
  };
}

/**
 * Equipment Usage sheet commands and queries (CM-604). Every write is one
 * transaction: the equipment row lock with the availability rule of
 * CM-0016 §11 re-checked, the one-sheet-per-shift rule, the back-dated
 * check, the number, the rows, the stock postings (`SiteStock`, §5) and
 * the audit event. Stock events, `document.approved`,
 * `EquipmentHireAccrued` and `EquipmentFuelOverrun` go out after commit.
 */
export class EquipmentSheetHandlers {
  private readonly clock: () => Date;

  constructor(private readonly deps: EquipmentSheetDeps) {
    this.clock = deps.clock ?? (() => new Date());
  }

  // -------------------------------------------------------------------------
  // Writes
  // -------------------------------------------------------------------------

  /** The master facts the content rules read, for the ids the input names. */
  private async facts(
    access: MemberAccess,
    projectId: string,
    input: EquipmentSheetCommand,
    equipment: SheetEquipmentFacts,
  ): Promise<EquipmentSheetFacts> {
    const { db, directory, team } = this.deps;
    const workspaceId = access.workspaceId;
    const id = (value: string | null | undefined) =>
      value == null || value.trim() === "" ? null : value;
    const contractorId = id(input.contractorId);
    const departmentId = id(input.departmentId);
    const unitId = id(input.approxWorkUnitId);
    const supervisorId = id(input.supervisorUserId);
    const [contractors, departments, units, materials, members] =
      await Promise.all([
        contractorId == null
          ? new Map<string, WorksheetContractorFacts>()
          : directory.contractors(db, workspaceId, [contractorId]),
        departmentId == null
          ? new Map<string, WorksheetNamedFacts>()
          : directory.departments(db, workspaceId, [departmentId]),
        unitId == null
          ? ([] as WorksheetNamedFacts[])
          : directory.units(db, workspaceId, [unitId]),
        directory.materials(
          db,
          workspaceId,
          (input.materials ?? []).map((line) => line.materialId),
        ),
        supervisorId == null
          ? []
          : team.projectTeamMembers(workspaceId, projectId),
      ]);
    const contractor =
      contractorId == null ? null : contractors.get(contractorId);
    const department =
      departmentId == null ? null : departments.get(departmentId);
    const unit = units[0];
    return {
      equipment,
      financial: seesSheetMoney(access, projectId),
      supervisor: members.some((member) => member.userId === supervisorId)
        ? { userId: supervisorId ?? "" }
        : null,
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
      unit: unit == null ? null : { id: unit.id, disabled: unit.disabled },
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

  /** Validates the command against the settings, the equipment and the masters. */
  private async content(
    access: MemberAccess,
    projectId: string,
    input: EquipmentSheetCommand,
    settings: EquipmentSheetSettings,
    equipment: SheetEquipmentFacts,
    previous: EquipmentSheetContent | null,
  ): Promise<EquipmentSheetContent> {
    const sheetDate = assertCalendarDate(input.sheetDate, "SHEET_DATE_INVALID");
    assertSheetDateNotFuture(
      sheetDate,
      await this.deps.today(access.workspaceId),
    );
    const facts = await this.facts(access, projectId, input, equipment);
    // A hidden Location is neither validated nor stored.
    const siteLocation =
      settings.showLocation && input.siteLocation != null
        ? locationRef(input.siteLocation)
        : null;
    const { content } = equipmentSheetContent(
      {
        ...input,
        sheetDate,
        siteLocation,
        timeShifts: input.timeShifts ?? [],
        materials: input.materials ?? [],
      },
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

  /** The availability rule of CM-0016 §11, on the locked equipment row. */
  private async assertFree(
    tx: Db,
    workspaceId: string,
    equipmentId: string,
    projectId: string,
    date: CalendarDate,
  ): Promise<StoredEquipment> {
    const locked = await this.deps.register.lock(tx, workspaceId, equipmentId);
    if (locked == null) throw equipmentNotFound();
    const facts = (
      await this.deps.register.lifecycleFacts(tx, [equipmentId])
    ).get(equipmentId) ?? { movements: [], maintenance: [] };
    const blocker = equipmentSheetBlocker({
      date,
      projectId,
      availableForEntry: locked.availableForEntry,
      movements: facts.movements,
      maintenance: facts.maintenance,
    });
    if (blocker != null) throw equipmentSheetBlocked(blocker);
    return locked;
  }

  private posting(
    access: MemberAccess,
    projectId: string,
    number: string,
    row: EquipmentSheetRow,
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

  /** The events a saved or decided sheet raises (after commit). */
  private sheetEvents(
    sheet: {
      id: string;
      workspaceId: string;
      projectId: string;
      equipmentId: string;
      ownership: EquipmentOwnership;
      sheetDate: CalendarDate;
      hireCost: bigint | null;
      fuelQty: string | null;
      fuelOverrun: boolean;
      approval: EquipmentSheetApproval;
    },
    equipment: {
      hirePartyId: string | null;
      expectedFuelEfficiency: string | null;
    },
    at: Date,
    options: { saved: boolean; approvedBy: string | null },
  ): DomainEvent[] {
    const events: DomainEvent[] = [];
    if (options.approvedBy != null)
      events.push({
        type: "document.approved",
        workspaceId: sheet.workspaceId,
        occurredAt: at,
        documentType: DOCUMENT.type,
        documentId: sheet.id,
        projectId: sheet.projectId,
        approvedBy: options.approvedBy,
      } satisfies DocumentApproved as DomainEvent);
    if (
      accruesHire(sheet.ownership, sheet.approval.status) &&
      sheet.hireCost != null
    )
      events.push({
        type: "EquipmentHireAccrued",
        workspaceId: sheet.workspaceId,
        occurredAt: at,
        sheetId: sheet.id,
        equipmentId: sheet.equipmentId,
        projectId: sheet.projectId,
        hirePartyId: equipment.hirePartyId,
        date: sheet.sheetDate,
        hireCost: sheet.hireCost,
      } satisfies EquipmentHireAccrued as DomainEvent);
    if (
      options.saved &&
      sheet.fuelOverrun &&
      sheet.fuelQty != null &&
      equipment.expectedFuelEfficiency != null
    )
      events.push({
        type: "EquipmentFuelOverrun",
        workspaceId: sheet.workspaceId,
        occurredAt: at,
        sheetId: sheet.id,
        equipmentId: sheet.equipmentId,
        projectId: sheet.projectId,
        date: sheet.sheetDate,
        fuelQty: sheet.fuelQty,
        expectedFuelEfficiency: equipment.expectedFuelEfficiency,
      } satisfies EquipmentFuelOverrun as DomainEvent);
    return events;
  }

  /** Voids an accrual the sheet raised before (CM-0016 §12; M7 payables). */
  private hireVoided(
    sheet: {
      id: string;
      workspaceId: string;
      projectId: string;
      equipmentId: string;
    },
    at: Date,
  ): DomainEvent {
    return {
      type: "EquipmentHireAccrualVoided",
      workspaceId: sheet.workspaceId,
      occurredAt: at,
      sheetId: sheet.id,
      equipmentId: sheet.equipmentId,
      projectId: sheet.projectId,
    } satisfies EquipmentHireAccrualVoided as DomainEvent;
  }

  private async dispatch(events: readonly DomainEvent[]) {
    if (events.length > 0) await this.deps.events.dispatch(events);
  }

  /**
   * Saves a new sheet for equipment that may take one on that date (§11):
   * Save, or Save & Approve (needs Approve). The number comes from the EU
   * rule, the date from the back-dated policy, and each material line
   * posts Consumed stock (409 `STOCK_INSUFFICIENT` refuses the whole save).
   */
  async create(
    access: MemberAccess,
    input: EquipmentSheetCommand & {
      projectId: string;
      equipmentId: string;
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
    const equipment = await this.deps.register.find(
      db,
      access.workspaceId,
      input.equipmentId,
    );
    if (equipment == null) throw equipmentNotFound();
    const settings = await this.deps.settings.get(
      access.workspaceId,
      input.projectId,
    );
    const facts = equipmentFacts(equipment);
    const content = await this.content(
      access,
      input.projectId,
      input,
      settings,
      facts,
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
      { userId: access.userId, at },
    );
    const row: EquipmentSheetRow = {
      ...content,
      lines: content.lines.map((line) => ({ ...line, id: newId() })),
    };
    const { events } = await db.$transaction(async (tx) => {
      check(DOCUMENT.backdated, "create", content.sheetDate);
      await this.assertFree(
        tx,
        access.workspaceId,
        equipment.id,
        input.projectId,
        content.sheetDate,
      );
      if (
        await store.taken(
          tx,
          equipment.id,
          content.sheetDate,
          content.shift,
          null,
        )
      )
        throw equipmentSheetExists();
      const { number } = await nextSequenceNumber(tx, {
        workspaceId: access.workspaceId,
        module: "equipment_usage",
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
        equipmentId: equipment.id,
        ownership: facts.ownership,
        utilisationBasis: facts.utilisationBasis,
        workingTimeMethod: facts.workingTimeMethod,
        approval,
        duplicatedFromId,
        by: access.userId,
        at,
      });
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
        action: "equipment_sheet.created",
        entityType: "equipment_sheet",
        entityId: id,
        after: {
          number,
          equipmentId: equipment.id,
          duplicatedFromId,
          ...snapshot({ ...row, approval }),
        },
        occurredAt: at,
      });
      return posted;
    });
    await stock.dispatch(events);
    await this.dispatch(
      this.sheetEvents(
        {
          ...row,
          id,
          workspaceId: access.workspaceId,
          projectId: input.projectId,
          equipmentId: equipment.id,
          ownership: facts.ownership,
          approval,
        },
        equipment,
        at,
        {
          saved: true,
          approvedBy: approval.status === "approved" ? access.userId : null,
        },
      ),
    );
    return id;
  }

  /**
   * Edits a sheet under the Project's current settings (CM-0016 §2, §3).
   * The equipment stays; a new date is checked against its availability.
   * Postings are replaced, and approval goes back to pending (approved
   * with Save & Approve), or `not_required` with approval off.
   */
  async edit(
    access: MemberAccess,
    id: string,
    expectedUpdatedAt: Date,
    input: EquipmentSheetCommand,
  ): Promise<void> {
    const { db, store, stock } = this.deps;
    const current = await this.find(access.workspaceId, id);
    const scope = { projectId: current.projectId };
    assertCan(access, MENU, "update", scope);
    if (input.approve === true) assertCan(access, MENU, "approve", scope);
    const equipment = await this.equipmentOf(current);
    const settings = await this.deps.settings.get(
      access.workspaceId,
      current.projectId,
    );
    const facts = equipmentFacts(equipment, current);
    const content = await this.content(
      access,
      current.projectId,
      input,
      settings,
      facts,
      contentOf(current),
    );
    const check = await this.deps.backdated(access);
    const at = this.clock();
    const approval = savedApproval(
      settings.approvalEnabled,
      input.approve === true,
      { userId: access.userId, at },
    );
    const row: EquipmentSheetRow = {
      ...content,
      lines: content.lines.map((line) => ({ ...line, id: newId() })),
    };
    const { events } = await db.$transaction(async (tx) => {
      const [locked] = await store.lock(tx, access.workspaceId, [id]);
      if (locked == null) throw equipmentSheetNotFound();
      changed(locked, expectedUpdatedAt);
      check(DOCUMENT.backdated, "edit", locked.sheetDate);
      if (content.sheetDate !== locked.sheetDate) {
        check(DOCUMENT.backdated, "edit", content.sheetDate);
        await this.assertFree(
          tx,
          access.workspaceId,
          locked.equipmentId,
          locked.projectId,
          content.sheetDate,
        );
      }
      if (
        await store.taken(
          tx,
          locked.equipmentId,
          content.sheetDate,
          content.shift,
          id,
        )
      )
        throw equipmentSheetExists();
      await store.replace(tx, id, { ...row, approval, by: access.userId, at });
      const posted = await stock.replace(
        tx,
        { type: STOCK_SOURCE, id },
        this.posting(access, locked.projectId, locked.number, row),
      );
      await recordAudit(tx, {
        workspaceId: access.workspaceId,
        actorUserId: access.userId,
        action: "equipment_sheet.updated",
        entityType: "equipment_sheet",
        entityId: id,
        before: snapshot(locked),
        after: snapshot({ ...row, approval }),
        occurredAt: at,
      });
      return posted;
    });
    await stock.dispatch(events);
    const voided =
      accruesHire(current.ownership, current.approval.status) &&
      !accruesHire(current.ownership, approval.status);
    await this.dispatch([
      ...(voided ? [this.hireVoided(current, at)] : []),
      ...this.sheetEvents({ ...current, ...row, approval }, equipment, at, {
        saved: true,
        approvedBy: approval.status === "approved" ? access.userId : null,
      }),
    ]);
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
      if (locked == null) throw equipmentSheetNotFound();
      changed(locked, expectedUpdatedAt);
      check(DOCUMENT.backdated, "edit", locked.sheetDate);
      await store.tombstone(tx, id, access.userId, at);
      const reversed = await stock.reverse(
        tx,
        { type: STOCK_SOURCE, id },
        { workspaceId: access.workspaceId, by: access.userId },
      );
      await recordAudit(tx, {
        workspaceId: access.workspaceId,
        actorUserId: access.userId,
        action: "equipment_sheet.deleted",
        entityType: "equipment_sheet",
        entityId: id,
        before: { number: locked.number, ...snapshot(locked) },
        occurredAt: at,
      });
      return reversed;
    });
    await stock.dispatch(events);
    await this.deps.media.dispatch([
      siteWorkDocumentMediaRemoved({
        workspaceId: access.workspaceId,
        projectId: current.projectId,
        type: DOCUMENT.type,
        documentId: id,
        at,
      }),
    ]);
    if (accruesHire(current.ownership, current.approval.status))
      await this.dispatch([this.hireVoided(current, at)]);
  }

  /** Approve or reject one (409 `EQUIPMENT_SHEET_NOT_PENDING` when not pending). */
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
    const approved: StoredEquipmentSheet[] = [];
    await db.$transaction(async (tx) => {
      const locked = new Map(
        (await store.lock(tx, access.workspaceId, ids)).map((sheet) => [
          sheet.id,
          sheet,
        ]),
      );
      const refusals: BulkRefusal[] = [];
      const next = new Map<string, EquipmentSheetApproval>();
      for (const id of ids) {
        const sheet = locked.get(id);
        if (sheet?.projectId !== projectId) {
          if (!bulk) throw equipmentSheetNotFound();
          refusals.push({
            id,
            code: "EQUIPMENT_SHEET_NOT_FOUND",
            message: "This Equipment Usage sheet was not found.",
          });
          continue;
        }
        if (!bulk) changed(sheet, expectedUpdatedAt);
        try {
          next.set(id, decideEquipmentSheet(sheet.approval, decision, by));
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
            ? "equipment_sheet.approved"
            : "equipment_sheet.rejected",
          entityType: "equipment_sheet",
          entityId: id,
          after: {
            approvalStatus: approval.status,
            rejectionReason: approval.rejectionReason,
            bulk,
          },
          occurredAt: at,
        });
        const sheet = locked.get(id);
        if (decision.approve && sheet != null)
          approved.push({ ...sheet, approval });
      }
    });
    if (approved.length === 0) return;
    const equipment = await store.equipment(
      db,
      access.workspaceId,
      approved.map((sheet) => sheet.equipmentId),
    );
    await this.dispatch(
      approved.flatMap((sheet) =>
        this.sheetEvents(
          sheet,
          equipment.get(sheet.equipmentId) ?? {
            hirePartyId: null,
            expectedFuelEfficiency: null,
          },
          at,
          { saved: false, approvedBy: access.userId },
        ),
      ),
    );
  }

  // -------------------------------------------------------------------------
  // Reads
  // -------------------------------------------------------------------------

  async find(workspaceId: string, id: string): Promise<StoredEquipmentSheet> {
    const sheet = await this.deps.store.find(this.deps.db, workspaceId, id);
    if (sheet == null) throw equipmentSheetNotFound();
    return sheet;
  }

  /** The sheet's equipment from the register (deleted is refused). */
  private async equipmentOf(
    sheet: StoredEquipmentSheet,
  ): Promise<StoredEquipment> {
    const equipment = await this.deps.register.find(
      this.deps.db,
      sheet.workspaceId,
      sheet.equipmentId,
    );
    if (equipment == null) throw equipmentNotFound();
    return equipment;
  }

  private async readModels(
    workspaceId: string,
    rows: readonly StoredEquipmentSheet[],
  ): Promise<EquipmentSheetReadModel[]> {
    const { db, directory, store } = this.deps;
    const ids = (pick: (row: StoredEquipmentSheet) => string | null) => [
      ...new Set(rows.map(pick).filter((id): id is string => id != null)),
    ];
    const userIds = new Set<string>();
    for (const row of rows) {
      userIds.add(row.createdBy);
      if (row.approval.decidedBy != null) userIds.add(row.approval.decidedBy);
      if (row.supervisorUserId != null) userIds.add(row.supervisorUserId);
    }
    const equipment = await store.equipment(
      db,
      workspaceId,
      ids((row) => row.equipmentId),
    );
    const hirePartyIds = [...equipment.values()]
      .map((item) => item.hirePartyId)
      .filter((id): id is string => id != null);
    const [contractors, departments, units, names] = await Promise.all([
      directory.contractors(db, workspaceId, [
        ...new Set([...ids((row) => row.contractorId), ...hirePartyIds]),
      ]),
      directory.departments(
        db,
        workspaceId,
        ids((row) => row.departmentId),
      ),
      directory.units(
        db,
        workspaceId,
        ids((row) => row.approxWorkUnitId),
      ),
      directory.memberNames(db, workspaceId, [...userIds]),
    ]);
    const unitNames = new Map(units.map((row) => [row.id, row.name]));
    const nameOf = <T>(
      map: Map<string, T>,
      id: string | null,
      pick: (value: T) => string,
    ) => {
      if (id == null) return null;
      const value = map.get(id);
      return value == null ? null : pick(value);
    };
    return rows.map((row) => {
      const machine = equipment.get(row.equipmentId) ?? {
        id: row.equipmentId,
        name: "—",
        equipmentNumber: "—",
        fuelUnit: null,
        expectedFuelEfficiency: null,
        hirePartyId: null,
        hireBasis: null,
        hireRate: null,
        idleChargeable: false,
      };
      return {
        ...row,
        equipment: {
          ...machine,
          hirePartyName: nameOf(
            contractors,
            machine.hirePartyId,
            (c) => c.name,
          ),
        },
        contractorName: nameOf(contractors, row.contractorId, (c) => c.name),
        departmentName: nameOf(departments, row.departmentId, (d) => d.name),
        approxWorkUnitName:
          row.approxWorkUnitId == null
            ? null
            : (unitNames.get(row.approxWorkUnitId) ?? null),
        supervisorName:
          row.supervisorUserId == null
            ? null
            : (names.get(row.supervisorUserId) ?? null),
        createdByName: names.get(row.createdBy) ?? null,
        decidedByName:
          row.approval.decidedBy == null
            ? null
            : (names.get(row.approval.decidedBy) ?? null),
      };
    });
  }

  /** One sheet with the names of what it points at and the previous closing. */
  async get(workspaceId: string, id: string): Promise<EquipmentSheetDetail> {
    const sheet = await this.find(workspaceId, id);
    const [[model], previousClosing] = await Promise.all([
      this.readModels(workspaceId, [sheet]),
      this.deps.store.previousClosing(
        this.deps.db,
        sheet.equipmentId,
        sheet.sheetDate,
        sheet.shift,
        sheet.id,
      ),
    ]);
    if (model == null) throw equipmentSheetNotFound();
    return { ...model, previousClosing };
  }

  /**
   * A Project's sheets, newest first, filtered by date range, equipment,
   * ownership, Filled By and approval, with the filter options and totals.
   */
  async list(params: EquipmentSheetListParams) {
    const { db, store, directory } = this.deps;
    const [page, facets] = await Promise.all([
      store.list(db, params),
      store.facets(db, params.workspaceId, params.projectId),
    ]);
    const [items, names, equipment] = await Promise.all([
      this.readModels(params.workspaceId, page.items),
      directory.memberNames(db, params.workspaceId, facets.createdBy),
      store.equipment(db, params.workspaceId, facets.equipmentIds),
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
        equipment: [...equipment.values()]
          .map(({ id, name, equipmentNumber }) => ({
            id,
            name,
            equipmentNumber,
          }))
          .sort(byName),
      },
    };
  }

  /**
   * What the form offers on a Project besides the equipment (which comes
   * from `GET /equipment/sheet-options`): its settings, supervisors, the
   * active Contractors with their enabled Departments, and the units.
   */
  async formOptions(
    workspaceId: string,
    projectId: string,
  ): Promise<EquipmentSheetFormOptions> {
    const { db, directory, team } = this.deps;
    const [settings, onProject, units, members] = await Promise.all([
      this.deps.settings.get(workspaceId, projectId),
      directory.contractorsOnProject(db, workspaceId, projectId),
      directory.units(db, workspaceId, null),
      team.projectTeamMembers(workspaceId, projectId),
    ]);
    const active = onProject.filter((contractor) => contractor.isActive);
    const departments = await directory.departments(db, workspaceId, [
      ...new Set(active.flatMap((contractor) => contractor.departmentIds)),
    ]);
    const enabled = new Map(
      [...departments.values()]
        .filter((department) => !department.disabled)
        .map((department) => [department.id, department.name]),
    );
    const byName = (a: { name: string }, b: { name: string }) =>
      a.name.localeCompare(b.name);
    return {
      settings,
      supervisors: members
        .map(({ userId, name }) => ({ userId, name }))
        .sort(byName),
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
      units: units
        .filter((unit) => !unit.disabled)
        .map(({ id, name }) => ({ id, name }))
        .sort(byName),
    };
  }

  /**
   * Stock per material at the Project on a date; when editing, the sheet's
   * own lines are added back if it is dated on or before that date.
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
