import { z } from "zod";

import type {
  PhaseView,
  WingDetail,
  WingsOverview,
  WingSummary,
} from "@/src/projects/application/structure-read-model";
import { PHASE_NAME_MAX } from "@/src/projects/domain/phase";
import { WING_NAME_MAX } from "@/src/projects/domain/wing";
import {
  FLOOR_KINDS,
  WING_BASEMENTS_MAX,
  WING_FLOOR_NAME_MAX,
  WING_FLOOR_ROWS_MAX,
  WING_FLOORS_MAX,
  WING_SCHEME_UNITS_MAX,
  WING_START_NUMBER_MAX,
  WING_TYPE_KEYS,
  WING_UNIT_NAME_MAX,
  WING_UNITS_MAX,
  WING_UNITS_PER_FLOOR_MAX,
} from "@/src/projects/domain/wing-generator";

const count = z.int().nonnegative();

const expectedUpdatedAt = (code: string) =>
  z.iso
    .datetime()
    .describe(`The \`updatedAt\` you loaded. A mismatch is 409 ${code}.`);

export const wingTypeModel = z
  .enum(WING_TYPE_KEYS)
  .describe(
    "commercial, residential, bungalow_scheme, residential_and_commercial, plotting_scheme, institutional, individual_unit or industrial.",
  );

export const floorKindModel = z
  .enum(FLOOR_KINDS)
  .describe(
    "terrace, typed (a numbered floor), ground, basement, site (the one row of a scheme) or other (a named floor: stilt, podium, mezzanine).",
  );

// Phases ---------------------------------------------------------------

export const ConstructionProjectsPhaseParamsModel = z.object({
  id: z.uuid(),
  phaseId: z.uuid(),
});

export const ConstructionProjectsPhaseResponseModel = z.object({
  id: z.uuid(),
  name: z.string(),
  position: z.int().describe("Order on the Wings screen."),
  wings: count.describe("Live Wings in the Phase."),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso
    .datetime()
    .describe("Send it back as `expectedUpdatedAt` when you rename."),
});

export type ConstructionProjectsPhaseResponseModel = z.infer<
  typeof ConstructionProjectsPhaseResponseModel
>;

export const ListConstructionProjectsPhasesResponseModel = z.object({
  items: z.array(ConstructionProjectsPhaseResponseModel).describe("In order."),
});

export type ListConstructionProjectsPhasesResponseModel = z.infer<
  typeof ListConstructionProjectsPhasesResponseModel
>;

const phaseName = z
  .string()
  .describe(
    `Required; at most ${String(PHASE_NAME_MAX)} characters, unique on the Project ignoring case (409 PHASE_NAME_IN_USE).`,
  );

export const CreateConstructionProjectsPhaseRequestModel = z.object({
  name: phaseName,
});

export type CreateConstructionProjectsPhaseRequestModel = z.infer<
  typeof CreateConstructionProjectsPhaseRequestModel
>;

export const RenameConstructionProjectsPhaseRequestModel = z.object({
  name: phaseName,
  expectedUpdatedAt: expectedUpdatedAt("PHASE_CHANGED"),
});

export type RenameConstructionProjectsPhaseRequestModel = z.infer<
  typeof RenameConstructionProjectsPhaseRequestModel
>;

export function toPhaseResponse(
  phase: PhaseView,
): ConstructionProjectsPhaseResponseModel {
  return {
    id: phase.id,
    name: phase.name,
    position: phase.position,
    wings: phase.wings,
    createdAt: phase.createdAt.toISOString(),
    updatedAt: phase.updatedAt.toISOString(),
  };
}

// Wings ----------------------------------------------------------------

export const ConstructionProjectsWingParamsModel = z.object({
  id: z.uuid(),
  wingId: z.uuid(),
});

const configNumber = (description: string) =>
  z.number().nullable().optional().describe(description);

/**
 * The Add Wing configuration. Only the Wing Type's fields are read and
 * kept; the domain checks the bounds (400 with `details.field`).
 */
export const ConstructionProjectsWingConfigModel = z.object({
  floors: configNumber(
    `Typed floors, 0–${String(WING_FLOORS_MAX)} (floor-stack types). 400 WING_FLOORS_INVALID.`,
  ),
  startNumber: configNumber(
    `First floor or unit number, 0–${String(WING_START_NUMBER_MAX)}; a scheme defaults to 1. 400 WING_START_NUMBER_INVALID.`,
  ),
  unitsPerFloor: configNumber(
    `1–${String(WING_UNITS_PER_FLOOR_MAX)} (floor-stack types). 400 WING_UNITS_PER_FLOOR_INVALID.`,
  ),
  basements: configNumber(
    `Basement floors, 0–${String(WING_BASEMENTS_MAX)}, default 0. 400 WING_BASEMENTS_INVALID.`,
  ),
  terrace: z
    .boolean()
    .nullable()
    .optional()
    .describe("Generate a Terrace Floor; default true."),
  commercialFloors: configNumber("Residential & Commercial only."),
  commercialUnitsPerFloor: configNumber(
    "Residential & Commercial only; also Ground's units.",
  ),
  residentialFloors: configNumber(
    "Residential & Commercial only; with the commercial floors at most 150.",
  ),
  residentialUnitsPerFloor: configNumber("Residential & Commercial only."),
  units: configNumber(
    `Bungalow or plotting scheme: 1–${WING_SCHEME_UNITS_MAX.toLocaleString("en-IN")}. 400 WING_SCHEME_UNITS_INVALID.`,
  ),
});

export type ConstructionProjectsWingConfigModel = z.infer<
  typeof ConstructionProjectsWingConfigModel
>;

export const ConstructionProjectsWingUnitInputModel = z.object({
  id: z
    .uuid()
    .nullable()
    .optional()
    .describe(
      "A stored unit's id (Edit Wing); omit for a new unit. 400 WING_UNIT_NOT_FOUND for an id not on the Wing.",
    ),
  name: z
    .string()
    .describe(
      `At most ${String(WING_UNIT_NAME_MAX)} characters, unique in the Wing ignoring case (400 WING_UNIT_NAME_DUPLICATE).`,
    ),
});

export const ConstructionProjectsWingFloorInputModel = z.object({
  id: z
    .uuid()
    .nullable()
    .optional()
    .describe(
      "A stored floor's id (Edit Wing); omit for a new floor. A stored floor keeps its kind.",
    ),
  kind: floorKindModel,
  name: z
    .string()
    .describe(
      `At most ${String(WING_FLOOR_NAME_MAX)} characters, unique in the Wing ignoring case.`,
    ),
  units: z
    .array(ConstructionProjectsWingUnitInputModel)
    .max(WING_UNITS_MAX + 1)
    .describe("In order on the floor."),
});

const floorsInput = z
  .array(ConstructionProjectsWingFloorInputModel)
  .max(WING_FLOOR_ROWS_MAX + 1)
  .describe(
    `Every floor of the Wing, top to bottom (at most ${String(WING_FLOOR_ROWS_MAX)}, with at most ${WING_UNITS_MAX.toLocaleString("en-IN")} units). 400 WING_FLOORS_REQUIRED, WING_TOO_MANY_FLOORS, WING_TOO_MANY_UNITS, WING_FLOORS_INVALID, WING_FLOOR_ORDER_INVALID, WING_FLOOR_NAME_*, WING_UNIT_NAME_* with \`details.floorIndex\` / \`unitIndex\`.`,
  );

const wingName = z
  .string()
  .describe(
    `Required; at most ${String(WING_NAME_MAX)} characters, unique on the Project ignoring case (409 WING_NAME_IN_USE).`,
  );

export const CreateConstructionProjectsWingRequestModel = z.object({
  phaseId: z
    .uuid()
    .nullable()
    .optional()
    .describe(
      "The Phase; omitted, the first Phase (a Project with none gets “Phase 1”). 400 WING_PHASE_INVALID.",
    ),
  type: wingTypeModel,
  name: wingName,
  config: ConstructionProjectsWingConfigModel,
  floors: floorsInput,
});

export type CreateConstructionProjectsWingRequestModel = z.infer<
  typeof CreateConstructionProjectsWingRequestModel
>;

export const UpdateConstructionProjectsWingRequestModel = z.object({
  phaseId: z
    .uuid()
    .nullable()
    .optional()
    .describe("Move the Wing to this Phase; omitted keeps it."),
  name: wingName,
  floors: floorsInput.describe(
    "Every floor the Wing keeps, top to bottom: rows with an id are updated, rows without one created, stored rows left out removed (409 UNIT_IN_USE / FLOOR_IN_USE when a site record uses one).",
  ),
  expectedUpdatedAt: expectedUpdatedAt("WING_CHANGED"),
});

export type UpdateConstructionProjectsWingRequestModel = z.infer<
  typeof UpdateConstructionProjectsWingRequestModel
>;

const totals = z.object({ floors: count, units: count });

export const ConstructionProjectsWingUnitModel = z.object({
  id: z.uuid(),
  name: z.string(),
  position: z.int().describe("Order on the floor, from 0."),
});

export const ConstructionProjectsWingFloorModel = z.object({
  id: z.uuid(),
  kind: floorKindModel,
  name: z.string(),
  level: z
    .int()
    .describe("Ground 0, floors above count up, basements below zero."),
  units: z.array(ConstructionProjectsWingUnitModel),
});

export const ConstructionProjectsWingResponseModel = z.object({
  id: z.uuid(),
  phaseId: z.uuid(),
  type: wingTypeModel,
  name: z.string(),
  config: ConstructionProjectsWingConfigModel.describe(
    "The configuration the Wing was generated from.",
  ),
  position: z.int(),
  floors: z
    .array(ConstructionProjectsWingFloorModel)
    .describe("Top to bottom."),
  totals,
  createdAt: z.iso.datetime(),
  updatedAt: z.iso
    .datetime()
    .describe("Send it back as `expectedUpdatedAt` when you save."),
});

export type ConstructionProjectsWingResponseModel = z.infer<
  typeof ConstructionProjectsWingResponseModel
>;

export const ConstructionProjectsWingSummaryModel = z.object({
  id: z.uuid(),
  phaseId: z.uuid(),
  type: wingTypeModel,
  name: z.string(),
  position: z.int(),
  floors: count,
  units: count,
  updatedAt: z.iso.datetime(),
});

/**
 * The Wings screen. A Project holds a handful of Phases and Wings, so the
 * list is not paged.
 */
export const ListConstructionProjectsWingsResponseModel = z.object({
  phases: z
    .array(
      ConstructionProjectsPhaseResponseModel.extend({
        items: z.array(ConstructionProjectsWingSummaryModel),
        floors: count,
        units: count,
      }),
    )
    .describe("Every Phase in order, empty ones too, with its Wings."),
  totals: z.object({ wings: count, floors: count, units: count }),
});

export type ListConstructionProjectsWingsResponseModel = z.infer<
  typeof ListConstructionProjectsWingsResponseModel
>;

function toSummary(wing: WingSummary) {
  return { ...wing, updatedAt: wing.updatedAt.toISOString() };
}

export function toWingsResponse(
  overview: WingsOverview,
): ListConstructionProjectsWingsResponseModel {
  return {
    phases: overview.phases.map((phase) => ({
      ...toPhaseResponse(phase),
      items: phase.items.map(toSummary),
      floors: phase.floors,
      units: phase.units,
    })),
    totals: overview.totals,
  };
}

export function toWingResponse(
  wing: WingDetail,
): ConstructionProjectsWingResponseModel {
  return {
    id: wing.id,
    phaseId: wing.phaseId,
    type: wing.type,
    name: wing.name,
    config: wing.config,
    position: wing.position,
    floors: wing.floors,
    totals: wing.totals,
    createdAt: wing.createdAt.toISOString(),
    updatedAt: wing.updatedAt.toISOString(),
  };
}
