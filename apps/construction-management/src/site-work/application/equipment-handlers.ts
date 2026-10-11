import { assertCan, can, type MemberAccess } from "@/src/shared-kernel/access";
import { optionalText } from "@/src/shared-kernel/approval";
import { recordAudit } from "@/src/shared-kernel/audit";
import {
  assertCalendarDate,
  type CalendarDate,
} from "@/src/shared-kernel/calendar-date";
import {
  DomainError,
  conflict,
  forbidden,
  notFound,
} from "@/src/shared-kernel/domain-error";
import { newId } from "@/src/shared-kernel/ids";
import type { ListCursor } from "@/src/shared-kernel/list-cursor";

import {
  availabilityChange,
  equipmentFields,
  equipmentNumberTaken,
  equipmentState,
  WAREHOUSE_LABEL,
  type EquipmentFields,
  type EquipmentFieldsInput,
  type EquipmentOwnership,
  type EquipmentState,
} from "../domain/equipment";
import {
  assertMaintenanceEnd,
  assertMaintenanceStart,
  assertPlacedOn,
  assertTransfer,
  equipmentSheetBlocker,
  locationNameOf,
  maintenanceAlreadyOpen,
  maintenanceCost,
  maintenanceNotOpen,
  type EquipmentMovementKind,
  type EquipmentSheetBlocker,
  type MaintenanceFact,
  type MaintenanceKind,
  type MovementFact,
} from "../domain/equipment-lifecycle";
import type { EquipmentDirectory, SiteWorkTx } from "./ports";

type Db = SiteWorkTx;

/** The register's menu (Company-level) and the usage sheets' (Project-level). */
export const EQUIPMENT_MENU = "masters.equipments";
export const EQUIPMENT_USAGE_MENU = "site_work.equipment_usage";

export const equipmentNotFound = () =>
  notFound("EQUIPMENT_NOT_FOUND", "This equipment was not found.");

export const maintenanceNotFound = () =>
  notFound("MAINTENANCE_NOT_FOUND", "This maintenance entry was not found.");

const permissionDenied = () =>
  forbidden(
    "PERMISSION_DENIED",
    "You do not have permission to do this. Ask the Owner to change your Permission Matrix.",
  );

// ---------------------------------------------------------------------------
// The store port (Prisma in `infrastructure/prisma-equipment-store`)
// ---------------------------------------------------------------------------

export type StoredMaintenance = {
  id: string;
  equipmentId: string;
  kind: MaintenanceKind;
  startDate: CalendarDate;
  endDate: CalendarDate | null;
  description: string | null;
  workshop: string | null;
  /** Paise. */
  cost: bigint | null;
  remark: string | null;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
  updatedBy: string;
};

export type StoredMovement = {
  id: string;
  equipmentId: string;
  kind: EquipmentMovementKind;
  movementDate: CalendarDate;
  fromProjectId: string | null;
  toProjectId: string | null;
  locationName: string;
  remark: string | null;
  createdAt: Date;
  createdBy: string;
};

export type StoredEquipment = EquipmentFields & {
  id: string;
  workspaceId: string;
  photoKey: string | null;
  photoThumbKey: string | null;
  /** Null at the warehouse. */
  currentProjectId: string | null;
  currentLocationName: string | null;
  availableForEntry: boolean;
  unavailableSince: CalendarDate | null;
  /** The open maintenance entry, if any. */
  openMaintenance: StoredMaintenance | null;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
  updatedBy: string;
};

export type EquipmentListParams = {
  workspaceId: string;
  ownership?: EquipmentOwnership;
  /** At this Project now. */
  projectId?: string;
  /** At the warehouse now. */
  warehouse?: boolean;
  state?: EquipmentState;
  /** Name or number contains, ignoring case. */
  search?: string;
  limit: number;
  after?: ListCursor;
};

/** A movement and maintenance history, as the sheet rule reads it. */
export type EquipmentLifecycleFacts = {
  movements: MovementFact[];
  maintenance: MaintenanceFact[];
};

export type EquipmentStore = {
  find(
    db: Db,
    workspaceId: string,
    id: string,
  ): Promise<StoredEquipment | null>;
  /** Locks the live row `FOR UPDATE` and reads it. */
  lock(
    db: Db,
    workspaceId: string,
    id: string,
  ): Promise<StoredEquipment | null>;
  /** Whether a live row other than `exceptId` has this number (any case). */
  numberTaken(
    db: Db,
    workspaceId: string,
    equipmentNumber: string,
    exceptId: string | null,
  ): Promise<boolean>;
  /** 409 `EQUIPMENT_NUMBER_TAKEN` when a concurrent save won the number. */
  insert(
    db: Db,
    row: EquipmentFields & {
      id: string;
      workspaceId: string;
      currentProjectId: string | null;
      currentLocationName: string;
      by: string;
      at: Date;
    },
  ): Promise<void>;
  update(
    db: Db,
    id: string,
    fields: EquipmentFields,
    by: string,
    at: Date,
  ): Promise<void>;
  setPlace(
    db: Db,
    id: string,
    place: { projectId: string | null; locationName: string },
    by: string,
    at: Date,
  ): Promise<void>;
  setAvailability(
    db: Db,
    id: string,
    availability: {
      availableForEntry: boolean;
      unavailableSince: CalendarDate | null;
    },
    by: string,
    at: Date,
  ): Promise<void>;
  setPhoto(
    db: Db,
    id: string,
    photo: { key: string; thumbKey: string | null } | null,
    by: string,
    at: Date,
  ): Promise<void>;
  /** Bumps `updated_at` for a write to a child row. */
  touch(db: Db, id: string, by: string, at: Date): Promise<void>;
  tombstone(db: Db, id: string, by: string, at: Date): Promise<void>;
  /** Oldest first (by date, then when recorded). */
  movements(db: Db, equipmentId: string): Promise<StoredMovement[]>;
  appendMovement(
    db: Db,
    row: Omit<StoredMovement, "createdAt"> & {
      workspaceId: string;
      at: Date;
    },
  ): Promise<void>;
  /** Live entries, newest start first. */
  maintenance(db: Db, equipmentId: string): Promise<StoredMaintenance[]>;
  /** 409 `MAINTENANCE_ALREADY_OPEN` when a concurrent entry won. */
  insertMaintenance(
    db: Db,
    row: Omit<StoredMaintenance, "createdAt" | "updatedAt" | "updatedBy"> & {
      workspaceId: string;
      at: Date;
    },
  ): Promise<void>;
  updateMaintenance(
    db: Db,
    id: string,
    patch: Pick<
      StoredMaintenance,
      | "kind"
      | "startDate"
      | "endDate"
      | "description"
      | "workshop"
      | "cost"
      | "remark"
    >,
    by: string,
    at: Date,
  ): Promise<void>;
  tombstoneMaintenance(db: Db, id: string, by: string, at: Date): Promise<void>;
  /** The latest live usage sheet date of this equipment at this Project. */
  lastSheetDate(
    db: Db,
    equipmentId: string,
    projectId: string,
  ): Promise<CalendarDate | null>;
  liveSheetCount(db: Db, equipmentId: string): Promise<number>;
  list(
    db: Db,
    params: EquipmentListParams,
  ): Promise<{ items: StoredEquipment[]; hasMore: boolean; total: number }>;
  /** Live equipment that has ever been moved to this Project. */
  everAt(
    db: Db,
    workspaceId: string,
    projectId: string,
  ): Promise<StoredEquipment[]>;
  lifecycleFacts(
    db: Db,
    equipmentIds: readonly string[],
  ): Promise<Map<string, EquipmentLifecycleFacts>>;
  /**
   * Per equipment, the closing reading of its latest live sheet dated on
   * or before `on` (by date, then shift).
   */
  lastClosingReadings(
    db: Db,
    equipmentIds: readonly string[],
    on: CalendarDate,
  ): Promise<Map<string, { reading: string; sheetDate: CalendarDate }>>;
};

export type EquipmentDeps = {
  db: Db & { $transaction<T>(fn: (tx: Db) => Promise<T>): Promise<T> };
  store: EquipmentStore;
  directory: EquipmentDirectory;
  today: (workspaceId: string) => Promise<CalendarDate>;
  clock?: () => Date;
};

// ---------------------------------------------------------------------------
// Permissions (CM-0016 §10, §11; decisions under CM-603 in modules/04)
// ---------------------------------------------------------------------------

/**
 * Hire rates: Financial on Equipments, or Financial on Equipment Usage at
 * the Project the equipment is at (CM-0016 §10).
 */
export function canSeeRates(
  access: MemberAccess,
  projectId: string | null,
): boolean {
  return (
    can(access, EQUIPMENT_MENU, "financial") ||
    (projectId != null &&
      can(access, EQUIPMENT_USAGE_MENU, "financial", { projectId }))
  );
}

/** Maintenance cost: Financial on Equipments. */
export function canSeeCosts(access: MemberAccess): boolean {
  return can(access, EQUIPMENT_MENU, "financial");
}

/** Read the register, or Equipment Usage read at the equipment's Project. */
export function canReadEquipment(
  access: MemberAccess,
  equipment: { currentProjectId: string | null },
): boolean {
  return (
    can(access, EQUIPMENT_MENU, "read") ||
    (equipment.currentProjectId != null &&
      can(access, EQUIPMENT_USAGE_MENU, "read", {
        projectId: equipment.currentProjectId,
      }))
  );
}

/** Adding equipment: Equipments Create, or Equipment Usage Create at that Project. */
export function canAddEquipment(
  access: MemberAccess,
  projectId: string | null,
): boolean {
  return (
    can(access, EQUIPMENT_MENU, "create") ||
    (projectId != null &&
      can(access, EQUIPMENT_USAGE_MENU, "create", { projectId }))
  );
}

/** The photo: Equipments Update, or Equipment Usage Create at its Project. */
export function canChangePhoto(
  access: MemberAccess,
  equipment: { currentProjectId: string | null },
): boolean {
  return (
    can(access, EQUIPMENT_MENU, "update") ||
    (equipment.currentProjectId != null &&
      can(access, EQUIPMENT_USAGE_MENU, "create", {
        projectId: equipment.currentProjectId,
      }))
  );
}

export type EquipmentActions = {
  edit: boolean;
  delete: boolean;
  transfer: boolean;
  logMaintenance: boolean;
  returnToService: boolean;
  editMaintenance: boolean;
  changeAvailability: boolean;
  changePhoto: boolean;
  seeRates: boolean;
  seeCosts: boolean;
};

export function equipmentActions(
  access: MemberAccess,
  equipment: StoredEquipment,
): EquipmentActions {
  const update = can(access, EQUIPMENT_MENU, "update");
  const open = equipment.openMaintenance != null;
  return {
    edit: update,
    delete: can(access, EQUIPMENT_MENU, "delete"),
    transfer: can(access, EQUIPMENT_MENU, "transfer") && !open,
    logMaintenance: update && !open,
    returnToService: update && open,
    editMaintenance: update,
    changeAvailability: update,
    changePhoto: canChangePhoto(access, equipment),
    seeRates: canSeeRates(access, equipment.currentProjectId),
    seeCosts: canSeeCosts(access),
  };
}

// ---------------------------------------------------------------------------
// Inputs and read models
// ---------------------------------------------------------------------------

export type CreateEquipmentInput = EquipmentFieldsInput & {
  /** Null = the warehouse / off system. */
  projectId: string | null;
  /** Where on the Project or which warehouse; defaults to its name. */
  locationName?: string | null;
  /** The `added` movement's date; defaults to today. */
  placedOn?: string | null;
};

/** `hireRate` undefined keeps the stored rate (members without Financial). */
export type UpdateEquipmentInput = Omit<EquipmentFieldsInput, "hireRate"> & {
  hireRate?: number | null;
};

export type TransferInput = {
  kind: "to_project" | "to_warehouse";
  toProjectId?: string | null;
  movementDate: string;
  locationName: string;
  remark?: string | null;
};

export type OpenMaintenanceInput = {
  kind: MaintenanceKind;
  startDate: string;
  description?: string | null;
  workshop?: string | null;
  /** Paise; needs Financial. Undefined leaves it empty. */
  cost?: number | null;
};

export type CloseMaintenanceInput = {
  endDate: string;
  /** Paise; needs Financial. Undefined keeps it. */
  cost?: number | null;
  remark?: string | null;
};

export type EditMaintenanceInput = {
  kind: MaintenanceKind;
  startDate: string;
  /** Only on a closed entry, which keeps one. */
  endDate?: string | null;
  description?: string | null;
  workshop?: string | null;
  /** Paise; needs Financial. Undefined keeps it. */
  cost?: number | null;
  remark?: string | null;
};

export type EquipmentReadModel = StoredEquipment & {
  state: EquipmentState;
  currentProjectName: string | null;
  hirePartyName: string | null;
};

/** One row of the Transfer Report (`modules/04`). */
export type MovementReadModel = StoredMovement & {
  /** "Location Before": the place it left, with that place's location name. */
  before: {
    projectId: string | null;
    projectName: string | null;
    locationName: string | null;
  } | null;
  toProjectName: string | null;
  createdByName: string | null;
};

export type MaintenanceReadModel = StoredMaintenance & {
  createdByName: string | null;
};

export type EquipmentDetail = EquipmentReadModel & {
  movements: MovementReadModel[];
  maintenance: MaintenanceReadModel[];
  createdByName: string | null;
};

/** What the usage-sheet form needs to know of one machine (CM-604). */
export type SheetOptionEquipment = EquipmentReadModel & {
  lastClosingReading: { reading: string; sheetDate: CalendarDate } | null;
};

export type SheetOptions = {
  /** May take a sheet at the Project on the date. */
  items: SheetOptionEquipment[];
  /** At the Project on the date, or now, but blocked, with why. */
  blocked: { equipment: EquipmentReadModel; reason: EquipmentSheetBlocker }[];
};

/** What the audit log keeps of the register's own fields. */
function snapshot(fields: EquipmentFields) {
  return {
    ownership: fields.ownership,
    name: fields.name,
    equipmentNumber: fields.equipmentNumber,
    purchaseYear: fields.purchaseYear,
    fuelType: fields.fuelType,
    fuelUnit: fields.fuelUnit,
    utilisationBasis: fields.utilisationBasis,
    workingTimeMethod: fields.workingTimeMethod,
    targetValue: fields.targetValue,
    targetUnit: fields.targetUnit,
    minUtilisationPct: fields.minUtilisationPct,
    expectedFuelEfficiency: fields.expectedFuelEfficiency,
    contactPersonName: fields.contactPersonName,
    contactPersonNumber: fields.contactPersonNumber,
    companyName: fields.companyName,
    hirePartyId: fields.hirePartyId,
    hireBasis: fields.hireBasis,
    hireRate: fields.hireRate?.toString() ?? null,
    idleChargeable: fields.idleChargeable,
  };
}

function changed(equipment: StoredEquipment, expectedUpdatedAt: Date): void {
  if (equipment.updatedAt.getTime() !== expectedUpdatedAt.getTime())
    throw conflict(
      "EQUIPMENT_CHANGED",
      "Someone changed this equipment. Reload it and try again.",
      { updatedAt: equipment.updatedAt.toISOString() },
    );
}

function dateOf(raw: string, code: string, field: string): CalendarDate {
  try {
    return assertCalendarDate(raw, code);
  } catch {
    throw new DomainError(code, `"${raw}" is not a date (YYYY-MM-DD).`, {
      details: { field },
    });
  }
}

function lineText(
  raw: string | null | undefined,
  field: string,
  max = 120,
): string | null {
  const text = raw?.trim().replace(/\s+/g, " ") ?? "";
  if (text.length > max)
    throw new DomainError(
      "TEXT_TOO_LONG",
      `Use at most ${String(max)} characters.`,
      { details: { field } },
    );
  return text === "" ? null : text;
}

/**
 * The Equipment register and its lifecycle (CM-603, CM-605). Every write is
 * one transaction: the row lock, the `expectedUpdatedAt` check (409
 * `EQUIPMENT_CHANGED`), the rows, the movement it implies and the audit
 * event. Lifecycle writes bump the equipment's `updated_at`, so one token
 * guards the whole detail page. Permissions are checked here as well as in
 * the routes.
 */
export class EquipmentHandlers {
  private readonly clock: () => Date;

  constructor(private readonly deps: EquipmentDeps) {
    this.clock = deps.clock ?? (() => new Date());
  }

  async find(workspaceId: string, id: string): Promise<StoredEquipment> {
    const found = await this.deps.store.find(this.deps.db, workspaceId, id);
    if (found == null) throw equipmentNotFound();
    return found;
  }

  private async assertProject(
    workspaceId: string,
    projectId: string,
    field: string,
  ): Promise<string> {
    const projects = await this.deps.directory.projects(
      this.deps.db,
      workspaceId,
      [projectId],
    );
    const project = projects.get(projectId);
    if (project == null)
      throw new DomainError(
        "PROJECT_NOT_FOUND",
        "This Project was not found.",
        {
          details: { field },
        },
      );
    return project.name;
  }

  /** A hire party must be a live Contractor; a new one also enabled. */
  private async assertHireParty(
    workspaceId: string,
    hirePartyId: string | null,
    keep: string | null,
  ): Promise<void> {
    if (hirePartyId == null) return;
    const parties = await this.deps.directory.hireParties(
      this.deps.db,
      workspaceId,
      [hirePartyId],
    );
    const party = parties.get(hirePartyId);
    if (party == null || (!party.isActive && hirePartyId !== keep))
      throw new DomainError(
        "HIRE_PARTY_NOT_FOUND",
        "This Contractor was not found.",
        { details: { field: "hirePartyId" } },
      );
  }

  private audit(
    tx: Db,
    access: MemberAccess,
    action: string,
    id: string,
    at: Date,
    change: { before?: unknown; after?: unknown },
  ) {
    return recordAudit(tx, {
      workspaceId: access.workspaceId,
      actorUserId: access.userId,
      action: `equipment.${action}`,
      entityType: "equipment",
      entityId: id,
      occurredAt: at,
      ...change,
    });
  }

  /**
   * Adds equipment to the register, at a Project or the warehouse, with
   * its `added` movement (CM-603).
   */
  async create(
    access: MemberAccess,
    input: CreateEquipmentInput,
  ): Promise<string> {
    if (!canAddEquipment(access, input.projectId)) throw permissionDenied();
    if (input.hireRate != null && !canSeeRates(access, input.projectId))
      throw permissionDenied();
    const { db, store } = this.deps;
    const today = await this.deps.today(access.workspaceId);
    const fields = equipmentFields(input, Number(today.slice(0, 4)));
    await this.assertHireParty(access.workspaceId, fields.hirePartyId, null);
    const placeName =
      input.projectId == null
        ? WAREHOUSE_LABEL
        : await this.assertProject(
            access.workspaceId,
            input.projectId,
            "projectId",
          );
    const placedOn =
      input.placedOn == null || input.placedOn === ""
        ? today
        : dateOf(input.placedOn, "PLACED_ON_INVALID", "placedOn");
    assertPlacedOn(placedOn, today);
    const locationName =
      input.locationName == null || input.locationName.trim() === ""
        ? placeName
        : locationNameOf(input.locationName);
    const id = newId();
    const at = this.clock();
    await db.$transaction(async (tx) => {
      if (
        await store.numberTaken(
          tx,
          access.workspaceId,
          fields.equipmentNumber,
          null,
        )
      )
        throw equipmentNumberTaken(fields.equipmentNumber);
      await store.insert(tx, {
        ...fields,
        id,
        workspaceId: access.workspaceId,
        currentProjectId: input.projectId,
        currentLocationName: locationName,
        by: access.userId,
        at,
      });
      await store.appendMovement(tx, {
        id: newId(),
        workspaceId: access.workspaceId,
        equipmentId: id,
        kind: "added",
        movementDate: placedOn,
        fromProjectId: null,
        toProjectId: input.projectId,
        locationName,
        remark: null,
        createdBy: access.userId,
        at,
      });
      await this.audit(tx, access, "created", id, at, {
        after: {
          ...snapshot(fields),
          projectId: input.projectId,
          locationName,
          placedOn,
        },
      });
    });
    return id;
  }

  /** Edits the register's fields (Equipments Update). */
  async update(
    access: MemberAccess,
    id: string,
    expectedUpdatedAt: Date,
    input: UpdateEquipmentInput,
  ): Promise<void> {
    assertCan(access, EQUIPMENT_MENU, "update");
    const { db, store } = this.deps;
    const current = await this.find(access.workspaceId, id);
    const seeRates = canSeeRates(access, current.currentProjectId);
    // Without Financial a rate is never sent (403 when it is); a rented
    // machine keeps its own. A `null` rate (owned equipment) is no rate.
    if (input.hireRate != null && !seeRates) throw permissionDenied();
    const kept =
      input.ownership === "rented" && current.hireRate != null
        ? Number(current.hireRate)
        : null;
    const hireRate =
      seeRates && input.hireRate !== undefined ? input.hireRate : kept;
    const today = await this.deps.today(access.workspaceId);
    const fields = equipmentFields(
      { ...input, hireRate },
      Number(today.slice(0, 4)),
    );
    await this.assertHireParty(
      access.workspaceId,
      fields.hirePartyId,
      current.hirePartyId,
    );
    const at = this.clock();
    await db.$transaction(async (tx) => {
      const locked = await store.lock(tx, access.workspaceId, id);
      if (locked == null) throw equipmentNotFound();
      changed(locked, expectedUpdatedAt);
      if (
        await store.numberTaken(
          tx,
          access.workspaceId,
          fields.equipmentNumber,
          id,
        )
      )
        throw equipmentNumberTaken(fields.equipmentNumber);
      await store.update(tx, id, fields, access.userId, at);
      await this.audit(tx, access, "updated", id, at, {
        before: snapshot(locked),
        after: snapshot(fields),
      });
    });
  }

  /** Tombstones it; refused with 409 `EQUIPMENT_IN_USE` once it has live sheets. */
  async delete(
    access: MemberAccess,
    id: string,
    expectedUpdatedAt: Date,
  ): Promise<void> {
    assertCan(access, EQUIPMENT_MENU, "delete");
    const { db, store } = this.deps;
    const at = this.clock();
    await db.$transaction(async (tx) => {
      const locked = await store.lock(tx, access.workspaceId, id);
      if (locked == null) throw equipmentNotFound();
      changed(locked, expectedUpdatedAt);
      const sheets = await store.liveSheetCount(tx, id);
      if (sheets > 0)
        throw conflict(
          "EQUIPMENT_IN_USE",
          "This equipment has Equipment Usage sheets, so it cannot be deleted. Delete the sheets first.",
          { sheets },
        );
      await store.tombstone(tx, id, access.userId, at);
      await this.audit(tx, access, "deleted", id, at, {
        before: snapshot(locked),
      });
    });
  }

  /** Transfer to Project / Transfer to Warehouse (Equipments Transfer). */
  async transfer(
    access: MemberAccess,
    id: string,
    expectedUpdatedAt: Date,
    input: TransferInput,
  ): Promise<void> {
    assertCan(access, EQUIPMENT_MENU, "transfer");
    const { db, store } = this.deps;
    const movementDate = dateOf(
      input.movementDate,
      "TRANSFER_DATE_INVALID",
      "movementDate",
    );
    const locationName = locationNameOf(input.locationName);
    const remark = optionalText(input.remark, "remark");
    const toProjectId =
      input.kind === "to_project" ? (input.toProjectId ?? null) : null;
    if (toProjectId != null)
      await this.assertProject(access.workspaceId, toProjectId, "toProjectId");
    const today = await this.deps.today(access.workspaceId);
    const at = this.clock();
    await db.$transaction(async (tx) => {
      const locked = await store.lock(tx, access.workspaceId, id);
      if (locked == null) throw equipmentNotFound();
      changed(locked, expectedUpdatedAt);
      const movements = await store.movements(tx, id);
      const last = movements.at(-1);
      assertTransfer({
        kind: input.kind,
        movementDate,
        today,
        currentProjectId: locked.currentProjectId,
        toProjectId,
        lastMovementDate: last?.movementDate ?? null,
        lastSheetDate:
          locked.currentProjectId == null
            ? null
            : await store.lastSheetDate(tx, id, locked.currentProjectId),
        inMaintenance: locked.openMaintenance != null,
      });
      await store.appendMovement(tx, {
        id: newId(),
        workspaceId: access.workspaceId,
        equipmentId: id,
        kind: input.kind,
        movementDate,
        fromProjectId: locked.currentProjectId,
        toProjectId,
        locationName,
        remark,
        createdBy: access.userId,
        at,
      });
      await store.setPlace(
        tx,
        id,
        { projectId: toProjectId, locationName },
        access.userId,
        at,
      );
      await this.audit(tx, access, "transferred", id, at, {
        before: {
          projectId: locked.currentProjectId,
          locationName: locked.currentLocationName,
        },
        after: {
          kind: input.kind,
          movementDate,
          projectId: toProjectId,
          locationName,
          remark,
        },
      });
    });
  }

  private assertCostAllowed(access: MemberAccess, cost: unknown): void {
    if (cost !== undefined && !canSeeCosts(access)) throw permissionDenied();
  }

  /** Log Maintenance: opens the one entry (Equipments Update; cost needs Financial). */
  async openMaintenance(
    access: MemberAccess,
    id: string,
    expectedUpdatedAt: Date,
    input: OpenMaintenanceInput,
  ): Promise<string> {
    assertCan(access, EQUIPMENT_MENU, "update");
    this.assertCostAllowed(access, input.cost);
    const { db, store } = this.deps;
    const startDate = dateOf(
      input.startDate,
      "MAINTENANCE_DATE_INVALID",
      "startDate",
    );
    assertMaintenanceStart(
      startDate,
      await this.deps.today(access.workspaceId),
    );
    const description = optionalText(input.description, "description");
    const workshop = lineText(input.workshop, "workshop");
    const cost = maintenanceCost(input.cost);
    const maintenanceId = newId();
    const at = this.clock();
    await db.$transaction(async (tx) => {
      const locked = await store.lock(tx, access.workspaceId, id);
      if (locked == null) throw equipmentNotFound();
      changed(locked, expectedUpdatedAt);
      if (locked.openMaintenance != null) throw maintenanceAlreadyOpen();
      await store.insertMaintenance(tx, {
        id: maintenanceId,
        workspaceId: access.workspaceId,
        equipmentId: id,
        kind: input.kind,
        startDate,
        endDate: null,
        description,
        workshop,
        cost,
        remark: null,
        createdBy: access.userId,
        at,
      });
      await store.touch(tx, id, access.userId, at);
      await this.audit(tx, access, "maintenance_opened", id, at, {
        after: {
          maintenanceId,
          kind: input.kind,
          startDate,
          description,
          workshop,
          cost: cost?.toString() ?? null,
        },
      });
    });
    return maintenanceId;
  }

  private async lockedEntry(
    tx: Db,
    access: MemberAccess,
    id: string,
    maintenanceId: string,
    expectedUpdatedAt: Date,
  ): Promise<{ equipment: StoredEquipment; entry: StoredMaintenance }> {
    const equipment = await this.deps.store.lock(tx, access.workspaceId, id);
    if (equipment == null) throw equipmentNotFound();
    changed(equipment, expectedUpdatedAt);
    const entry = (await this.deps.store.maintenance(tx, id)).find(
      (item) => item.id === maintenanceId,
    );
    if (entry == null) throw maintenanceNotFound();
    return { equipment, entry };
  }

  /** Return to Service: closes the open entry with an end date, cost and remark. */
  async closeMaintenance(
    access: MemberAccess,
    id: string,
    maintenanceId: string,
    expectedUpdatedAt: Date,
    input: CloseMaintenanceInput,
  ): Promise<void> {
    assertCan(access, EQUIPMENT_MENU, "update");
    this.assertCostAllowed(access, input.cost);
    const endDate = dateOf(
      input.endDate,
      "MAINTENANCE_DATE_INVALID",
      "endDate",
    );
    const remark = optionalText(input.remark, "remark");
    const cost = maintenanceCost(input.cost);
    const today = await this.deps.today(access.workspaceId);
    const at = this.clock();
    await this.deps.db.$transaction(async (tx) => {
      const { entry } = await this.lockedEntry(
        tx,
        access,
        id,
        maintenanceId,
        expectedUpdatedAt,
      );
      if (entry.endDate != null) throw maintenanceNotOpen();
      assertMaintenanceEnd(entry.startDate, endDate, today);
      const next = {
        kind: entry.kind,
        startDate: entry.startDate,
        endDate,
        description: entry.description,
        workshop: entry.workshop,
        cost: input.cost === undefined ? entry.cost : cost,
        remark,
      };
      await this.deps.store.updateMaintenance(
        tx,
        maintenanceId,
        next,
        access.userId,
        at,
      );
      await this.deps.store.touch(tx, id, access.userId, at);
      await this.audit(tx, access, "returned_to_service", id, at, {
        after: {
          maintenanceId,
          endDate,
          cost: next.cost?.toString() ?? null,
          remark,
        },
      });
    });
  }

  /** Edits a maintenance entry; an open one stays open (Equipments Update). */
  async editMaintenance(
    access: MemberAccess,
    id: string,
    maintenanceId: string,
    expectedUpdatedAt: Date,
    input: EditMaintenanceInput,
  ): Promise<void> {
    assertCan(access, EQUIPMENT_MENU, "update");
    this.assertCostAllowed(access, input.cost);
    const startDate = dateOf(
      input.startDate,
      "MAINTENANCE_DATE_INVALID",
      "startDate",
    );
    const endDate =
      input.endDate == null || input.endDate === ""
        ? null
        : dateOf(input.endDate, "MAINTENANCE_DATE_INVALID", "endDate");
    const description = optionalText(input.description, "description");
    const workshop = lineText(input.workshop, "workshop");
    const remark = optionalText(input.remark, "remark");
    const cost = maintenanceCost(input.cost);
    const today = await this.deps.today(access.workspaceId);
    assertMaintenanceStart(startDate, today);
    const at = this.clock();
    await this.deps.db.$transaction(async (tx) => {
      const { entry } = await this.lockedEntry(
        tx,
        access,
        id,
        maintenanceId,
        expectedUpdatedAt,
      );
      if (entry.endDate == null && endDate != null)
        throw new DomainError(
          "MAINTENANCE_STILL_OPEN",
          "Use Return to Service to close it.",
          { details: { field: "endDate" } },
        );
      if (entry.endDate != null && endDate == null)
        throw new DomainError(
          "MAINTENANCE_END_REQUIRED",
          "Enter the date it returned to service.",
          { details: { field: "endDate" } },
        );
      if (endDate != null) assertMaintenanceEnd(startDate, endDate, today);
      const next = {
        kind: input.kind,
        startDate,
        endDate,
        description,
        workshop,
        cost: input.cost === undefined ? entry.cost : cost,
        remark,
      };
      await this.deps.store.updateMaintenance(
        tx,
        maintenanceId,
        next,
        access.userId,
        at,
      );
      await this.deps.store.touch(tx, id, access.userId, at);
      await this.audit(tx, access, "maintenance_updated", id, at, {
        before: { ...entry, cost: entry.cost?.toString() ?? null },
        after: { maintenanceId, ...next, cost: next.cost?.toString() ?? null },
      });
    });
  }

  /** Deletes a maintenance entry (a tombstone; Equipments Update). */
  async deleteMaintenance(
    access: MemberAccess,
    id: string,
    maintenanceId: string,
    expectedUpdatedAt: Date,
  ): Promise<void> {
    assertCan(access, EQUIPMENT_MENU, "update");
    const at = this.clock();
    await this.deps.db.$transaction(async (tx) => {
      const { entry } = await this.lockedEntry(
        tx,
        access,
        id,
        maintenanceId,
        expectedUpdatedAt,
      );
      await this.deps.store.tombstoneMaintenance(
        tx,
        maintenanceId,
        access.userId,
        at,
      );
      await this.deps.store.touch(tx, id, access.userId, at);
      await this.audit(tx, access, "maintenance_deleted", id, at, {
        before: { ...entry, cost: entry.cost?.toString() ?? null },
      });
    });
  }

  /** Mark unavailable for worksheet entry (since today) / Make it available. */
  async setAvailability(
    access: MemberAccess,
    id: string,
    expectedUpdatedAt: Date,
    available: boolean,
  ): Promise<void> {
    assertCan(access, EQUIPMENT_MENU, "update");
    const today = await this.deps.today(access.workspaceId);
    const next = availabilityChange(available, today);
    const at = this.clock();
    await this.deps.db.$transaction(async (tx) => {
      const locked = await this.deps.store.lock(tx, access.workspaceId, id);
      if (locked == null) throw equipmentNotFound();
      changed(locked, expectedUpdatedAt);
      if (locked.availableForEntry === available) return;
      await this.deps.store.setAvailability(tx, id, next, access.userId, at);
      await this.audit(
        tx,
        access,
        available ? "made_available" : "marked_unavailable",
        id,
        at,
        {
          before: {
            availableForEntry: locked.availableForEntry,
            unavailableSince: locked.unavailableSince,
          },
          after: next,
        },
      );
    });
  }

  // -------------------------------------------------------------------------
  // Reads
  // -------------------------------------------------------------------------

  private async readModels(
    workspaceId: string,
    rows: readonly StoredEquipment[],
  ): Promise<EquipmentReadModel[]> {
    const { db, directory } = this.deps;
    const projectIds = [
      ...new Set(
        rows.flatMap((row) =>
          row.currentProjectId == null ? [] : [row.currentProjectId],
        ),
      ),
    ];
    const partyIds = [
      ...new Set(
        rows.flatMap((row) =>
          row.hirePartyId == null ? [] : [row.hirePartyId],
        ),
      ),
    ];
    const [projects, parties] = await Promise.all([
      directory.projects(db, workspaceId, projectIds),
      directory.hireParties(db, workspaceId, partyIds),
    ]);
    return rows.map((row) => ({
      ...row,
      state: equipmentState({
        inMaintenance: row.openMaintenance != null,
        availableForEntry: row.availableForEntry,
      }),
      currentProjectName:
        row.currentProjectId == null
          ? null
          : (projects.get(row.currentProjectId)?.name ?? null),
      hirePartyName:
        row.hirePartyId == null
          ? null
          : (parties.get(row.hirePartyId)?.name ?? null),
    }));
  }

  /** One machine with its Transfer Report rows and maintenance log. */
  async get(workspaceId: string, id: string): Promise<EquipmentDetail> {
    const { db, store, directory } = this.deps;
    const equipment = await this.find(workspaceId, id);
    const [[model], movements, maintenance] = await Promise.all([
      this.readModels(workspaceId, [equipment]),
      store.movements(db, id),
      store.maintenance(db, id),
    ]);
    if (model == null) throw equipmentNotFound();
    const projectIds = new Set<string>();
    const userIds = new Set<string>([equipment.createdBy]);
    for (const movement of movements) {
      if (movement.fromProjectId != null)
        projectIds.add(movement.fromProjectId);
      if (movement.toProjectId != null) projectIds.add(movement.toProjectId);
      userIds.add(movement.createdBy);
    }
    for (const entry of maintenance) userIds.add(entry.createdBy);
    const [projects, names] = await Promise.all([
      directory.projects(db, workspaceId, [...projectIds]),
      directory.memberNames(db, workspaceId, [...userIds]),
    ]);
    const projectName = (projectId: string | null) =>
      projectId == null ? null : (projects.get(projectId)?.name ?? null);
    return {
      ...model,
      createdByName: names.get(equipment.createdBy) ?? null,
      movements: movements.map((movement, index) => {
        const previous = index === 0 ? null : (movements[index - 1] ?? null);
        return {
          ...movement,
          before:
            previous == null
              ? null
              : {
                  projectId: previous.toProjectId,
                  projectName: projectName(previous.toProjectId),
                  locationName: previous.locationName,
                },
          toProjectName: projectName(movement.toProjectId),
          createdByName: names.get(movement.createdBy) ?? null,
        };
      }),
      maintenance: maintenance.map((entry) => ({
        ...entry,
        createdByName: names.get(entry.createdBy) ?? null,
      })),
    };
  }

  async list(params: EquipmentListParams) {
    const page = await this.deps.store.list(this.deps.db, params);
    return {
      ...page,
      items: await this.readModels(params.workspaceId, page.items),
    };
  }

  /**
   * The equipment that may take a usage sheet at a Project on a date
   * (CM-0016 §11), for the usage-sheet form (CM-604), with the last
   * closing meter reading; and those at the Project that may not, with why.
   */
  async sheetOptions(
    workspaceId: string,
    projectId: string,
    date: CalendarDate,
  ): Promise<SheetOptions> {
    const { db, store } = this.deps;
    const candidates = await store.everAt(db, workspaceId, projectId);
    const facts = await store.lifecycleFacts(
      db,
      candidates.map((item) => item.id),
    );
    const allowed: StoredEquipment[] = [];
    const blocked: {
      equipment: StoredEquipment;
      reason: EquipmentSheetBlocker;
    }[] = [];
    for (const equipment of candidates) {
      const fact = facts.get(equipment.id) ?? {
        movements: [],
        maintenance: [],
      };
      const reason = equipmentSheetBlocker({
        date,
        projectId,
        availableForEntry: equipment.availableForEntry,
        movements: fact.movements,
        maintenance: fact.maintenance,
      });
      if (reason == null) allowed.push(equipment);
      else if (
        reason !== "EQUIPMENT_NOT_ON_PROJECT" ||
        equipment.currentProjectId === projectId
      )
        blocked.push({ equipment, reason });
    }
    const [allowedModels, blockedModels, readings] = await Promise.all([
      this.readModels(workspaceId, allowed),
      this.readModels(
        workspaceId,
        blocked.map((item) => item.equipment),
      ),
      store.lastClosingReadings(
        db,
        allowed.map((item) => item.id),
        date,
      ),
    ]);
    return {
      items: allowedModels.map((model) => ({
        ...model,
        lastClosingReading: readings.get(model.id) ?? null,
      })),
      blocked: blockedModels.map((model, index) => ({
        equipment: model,
        reason: blocked[index]?.reason ?? "EQUIPMENT_NOT_ON_PROJECT",
      })),
    };
  }

  /** The add form's hire parties and every live Project. */
  async formOptions(workspaceId: string) {
    const { db, directory } = this.deps;
    const [hireParties, projects] = await Promise.all([
      directory.hirePartyOptions(db, workspaceId),
      directory.projectOptions(db, workspaceId),
    ]);
    return {
      hireParties: hireParties.map(({ id, name }) => ({ id, name })),
      projects,
    };
  }
}
