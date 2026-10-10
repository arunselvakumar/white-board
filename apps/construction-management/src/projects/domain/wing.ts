import { DomainError, notFound } from "@/src/shared-kernel/domain-error";

import { cleanWingFloors, type WingFloorInput } from "./wing-floors";
import {
  isWingType,
  tidyName,
  wingConfig,
  wingTotals,
  type FloorKind,
  type WingConfig,
  type WingConfigInput,
  type WingType,
} from "./wing-generator";

export const WING_NAME_MAX = 60;

export type WingUnit = { id: string; name: string; position: number };

export type WingFloor = {
  id: string;
  kind: FloorKind;
  name: string;
  level: number;
  units: WingUnit[];
};

export type WingProps = {
  id: string;
  workspaceId: string;
  projectId: string;
  phaseId: string;
  type: WingType;
  name: string;
  config: WingConfig;
  /** Order inside the Phase. */
  position: number;
  /** Live floors, top to bottom, each with its live units in order. */
  floors: WingFloor[];
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
  updatedBy: string;
  deletedAt: Date | null;
};

/** Stored rows an edit left out: they are tombstoned with the save. */
export type WingRemovals = {
  floorIds: string[];
  unitIds: string[];
};

export const wingNotFound = () =>
  notFound("WING_NOT_FOUND", "This Wing was not found.");

/** Wing Name: required, at most 60 characters, spaces tidied. */
export function wingName(raw: string): string {
  const name = tidyName(raw);
  if (name.length === 0)
    throw new DomainError("WING_NAME_REQUIRED", "Enter the Wing name.");
  if (name.length > WING_NAME_MAX)
    throw new DomainError(
      "WING_NAME_TOO_LONG",
      `Wing name must be at most ${String(WING_NAME_MAX)} characters.`,
    );
  return name;
}

function wingType(raw: string): WingType {
  if (!isWingType(raw))
    throw new DomainError("WING_TYPE_INVALID", "Choose a Wing Type.");
  return raw;
}

function unknownFloor(floorIndex: number): DomainError {
  return new DomainError(
    "WING_FLOOR_NOT_FOUND",
    "A floor in this save is not on the Wing. Reload and try again.",
    { details: { floorIndex } },
  );
}

function unknownUnit(floorIndex: number, unitIndex: number): DomainError {
  return new DomainError(
    "WING_UNIT_NOT_FOUND",
    "A unit in this save is not on the Wing. Reload and try again.",
    { details: { floorIndex, unitIndex } },
  );
}

/**
 * A building, block or scheme of a Project, in one Phase (ADR CM-0013 §3):
 * a Wing Type, a name unique in the Project ignoring case (the store
 * enforces it), the configuration it was generated from, and its floors
 * and units as the editor last saved them. Floor and unit ids survive an
 * edit, so site entries that point at them stay valid.
 */
export class Wing {
  private constructor(private props: WingProps) {}

  /**
   * Save on Add Wing: the configuration (checked again, kept for Edit) and
   * the floors and units the editor made from it. Every row is new here,
   * so a row with an id is 400 `WING_FLOOR_NOT_FOUND` / `WING_UNIT_NOT_FOUND`.
   */
  static create(input: {
    id: string;
    workspaceId: string;
    projectId: string;
    phaseId: string;
    position: number;
    type: string;
    name: string;
    config: WingConfigInput;
    floors: readonly WingFloorInput[];
    by: string;
    now: Date;
    newId: () => string;
  }): Wing {
    const type = wingType(input.type);
    const name = wingName(input.name);
    const config = wingConfig(type, input.config);
    const floors = cleanWingFloors(type, input.floors).map(
      (floor, floorIndex) => {
        if (floor.id != null) throw unknownFloor(floorIndex);
        return {
          id: input.newId(),
          kind: floor.kind,
          name: floor.name,
          level: floor.level,
          units: floor.units.map((unit, unitIndex) => {
            if (unit.id != null) throw unknownUnit(floorIndex, unitIndex);
            return {
              id: input.newId(),
              name: unit.name,
              position: unit.position,
            };
          }),
        };
      },
    );
    return new Wing({
      id: input.id,
      workspaceId: input.workspaceId,
      projectId: input.projectId,
      phaseId: input.phaseId,
      type,
      name,
      config,
      position: input.position,
      floors,
      createdAt: input.now,
      updatedAt: input.now,
      createdBy: input.by,
      updatedBy: input.by,
      deletedAt: null,
    });
  }

  static reconstitute(props: WingProps): Wing {
    return new Wing(props);
  }

  get id(): string {
    return this.props.id;
  }
  get workspaceId(): string {
    return this.props.workspaceId;
  }
  get projectId(): string {
    return this.props.projectId;
  }
  get phaseId(): string {
    return this.props.phaseId;
  }
  get type(): WingType {
    return this.props.type;
  }
  get name(): string {
    return this.props.name;
  }
  get config(): WingConfig {
    return this.props.config;
  }
  get position(): number {
    return this.props.position;
  }
  get floors(): readonly WingFloor[] {
    return this.props.floors;
  }
  get createdAt(): Date {
    return this.props.createdAt;
  }
  get updatedAt(): Date {
    return this.props.updatedAt;
  }
  get createdBy(): string {
    return this.props.createdBy;
  }
  get updatedBy(): string {
    return this.props.updatedBy;
  }
  get deletedAt(): Date | null {
    return this.props.deletedAt;
  }

  get totals(): { floors: number; units: number } {
    return wingTotals(this.props.floors);
  }

  /**
   * Edit Wing: name, Phase and the whole floor list from the editor. A row
   * sent with an id updates that floor or unit (a floor keeps its stored
   * kind); a row without one is new; a stored row left out is removed and
   * returned so the caller can ask whether anything uses it. The Wing Type
   * and configuration stay as generated.
   */
  update(input: {
    name: string;
    phaseId: string;
    position: number;
    floors: readonly WingFloorInput[];
    by: string;
    now: Date;
    newId: () => string;
  }): WingRemovals {
    const name = wingName(input.name);
    const storedFloors = new Map(
      this.props.floors.map((floor) => [floor.id, floor]),
    );
    const storedUnits = new Set(
      this.props.floors.flatMap((floor) => floor.units.map((unit) => unit.id)),
    );
    const seenFloors = new Set<string>();
    const seenUnits = new Set<string>();

    const requested = input.floors.map((floor, floorIndex) => {
      if (floor.id == null) return floor;
      const stored = storedFloors.get(floor.id);
      if (stored == null || seenFloors.has(floor.id))
        throw unknownFloor(floorIndex);
      seenFloors.add(floor.id);
      return { ...floor, kind: stored.kind };
    });
    const cleaned = cleanWingFloors(this.props.type, requested);

    const floors = cleaned.map((floor, floorIndex) => ({
      id: floor.id ?? input.newId(),
      kind: floor.kind,
      name: floor.name,
      level: floor.level,
      units: floor.units.map((unit, unitIndex) => {
        if (unit.id != null) {
          if (!storedUnits.has(unit.id) || seenUnits.has(unit.id))
            throw unknownUnit(floorIndex, unitIndex);
          seenUnits.add(unit.id);
        }
        return {
          id: unit.id ?? input.newId(),
          name: unit.name,
          position: unit.position,
        };
      }),
    }));

    const removals: WingRemovals = {
      floorIds: [...storedFloors.keys()].filter((id) => !seenFloors.has(id)),
      unitIds: [...storedUnits].filter((id) => !seenUnits.has(id)),
    };
    this.props = {
      ...this.props,
      name,
      phaseId: input.phaseId,
      position: input.position,
      floors,
      updatedAt: input.now,
      updatedBy: input.by,
    };
    return removals;
  }

  delete(by: string, now: Date): void {
    if (this.props.deletedAt != null) throw wingNotFound();
    this.props = {
      ...this.props,
      deletedAt: now,
      updatedAt: now,
      updatedBy: by,
    };
  }
}
