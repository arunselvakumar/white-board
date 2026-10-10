import type { AuditEvent } from "@/src/shared-kernel/audit";

import type { Location } from "./location";
import type { Phase } from "./phase";
import type { Wing, WingRemovals } from "./wing";

/** A Project's Phases (CM-402); each write is one transaction with its audit row. */
export type PhaseRepository = {
  /** Live Phases of the Project, in their order. */
  list(workspaceId: string, projectId: string): Promise<Phase[]>;
  find(
    workspaceId: string,
    projectId: string,
    id: string,
  ): Promise<Phase | null>;
  /** 409 `PHASE_NAME_IN_USE` for a live duplicate name. */
  insert(phase: Phase, audit: AuditEvent): Promise<void>;
  /** 409 `PHASE_CHANGED` on a stale `updatedAt`, `PHASE_NAME_IN_USE`. */
  update(
    phase: Phase,
    expectedUpdatedAt: Date,
    audit: AuditEvent,
  ): Promise<void>;
  /** Tombstones it; 409 `PHASE_NOT_EMPTY` while it holds live Wings. */
  delete(phase: Phase, audit: AuditEvent): Promise<void>;
};

/** A Project's Wings with their floors and units (CM-402). */
export type WingRepository = {
  /** A live Wing of the Project with its live floors and units, or null. */
  find(
    workspaceId: string,
    projectId: string,
    id: string,
  ): Promise<Wing | null>;
  /** Where a Wing added to the Phase goes: after its live Wings. */
  nextPosition(workspaceId: string, phaseId: string): Promise<number>;
  /**
   * Inserts the Wing, floors and units with its audit row; `phase` too
   * when the Wing brings its Project's first Phase. 409
   * `WING_NAME_IN_USE`; 404 `PHASE_NOT_FOUND` once its Phase is gone.
   */
  insert(
    wing: Wing,
    audit: AuditEvent,
    phase?: { phase: Phase; audit: AuditEvent },
  ): Promise<void>;
  /**
   * Writes an edit: kept floors and units updated by id, new ones created,
   * `removals` tombstoned. 409 `WING_CHANGED` when the stored `updatedAt`
   * is not `expectedUpdatedAt`, `WING_NAME_IN_USE` for a duplicate name.
   */
  update(
    wing: Wing,
    expectedUpdatedAt: Date,
    removals: WingRemovals,
    audit: AuditEvent,
  ): Promise<void>;
  /** Tombstones the Wing with its floors and units. */
  delete(wing: Wing, audit: AuditEvent): Promise<void>;
};

/** A Project's Locations (CM-405). */
export type LocationRepository = {
  /** Live Locations of the Project, in their order. */
  list(workspaceId: string, projectId: string): Promise<Location[]>;
  find(
    workspaceId: string,
    projectId: string,
    id: string,
  ): Promise<Location | null>;
  /** 409 `LOCATION_NAME_IN_USE` for a live duplicate name. */
  insert(location: Location, audit: AuditEvent): Promise<void>;
  /** 409 `LOCATION_CHANGED` on a stale `updatedAt`, `LOCATION_NAME_IN_USE`. */
  update(
    location: Location,
    expectedUpdatedAt: Date,
    audit: AuditEvent,
  ): Promise<void>;
  /**
   * Stores the new positions of two Locations that swapped places; 409
   * `LOCATION_CHANGED` when either changed since it was read.
   */
  swap(
    moved: { location: Location; expectedUpdatedAt: Date },
    other: { location: Location; expectedUpdatedAt: Date },
    audit: AuditEvent,
  ): Promise<void>;
  delete(location: Location, audit: AuditEvent): Promise<void>;
};

/**
 * Whether site records point at a piece of a Project's structure, asked
 * before a floor, unit, Wing or Location is removed (ADR CM-0013 §3–4).
 * Nothing points at them yet: Daily Work (M6), Tasks, Issues and
 * Inspections (M8) and Booking (M10) answer through this port when they
 * exist, so removing a referenced row is refused (409 `UNIT_IN_USE`,
 * `FLOOR_IN_USE`, `WING_IN_USE`, `LOCATION_IN_USE`).
 */
export type StructureUsage = {
  /** Of these floors and units, the ones a site record points at. */
  usedFloorsAndUnits(
    workspaceId: string,
    ids: { floorIds: readonly string[]; unitIds: readonly string[] },
  ): Promise<{ floorIds: string[]; unitIds: string[] }>;
  /** Whether anything points at the Wing or any of its floors and units. */
  isWingUsed(workspaceId: string, wingId: string): Promise<boolean>;
  isLocationUsed(workspaceId: string, locationId: string): Promise<boolean>;
};
