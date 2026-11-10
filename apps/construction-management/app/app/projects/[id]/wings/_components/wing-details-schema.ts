import { z } from "zod";

import { WING_NAME_MAX } from "@/src/projects/domain/wing";
import {
  WING_BASEMENTS_MAX,
  WING_FLOORS_MAX,
  WING_SCHEME_UNITS_MAX,
  WING_START_NUMBER_MAX,
  WING_TYPE_KEYS,
  WING_UNITS_PER_FLOOR_MAX,
  defaultWingConfigInput,
  isWingType,
  wingLayout,
  wingTypeLabel,
  type WingConfig,
  type WingConfigInput,
  type WingLayout,
  type WingType,
} from "@/src/projects/domain/wing-generator";

/** The Add Wing configuration fields that hold a number. */
export type ConfigNumberField =
  | "floors"
  | "startNumber"
  | "unitsPerFloor"
  | "basements"
  | "commercialFloors"
  | "commercialUnitsPerFloor"
  | "residentialFloors"
  | "residentialUnitsPerFloor"
  | "units";

/** The fields each layout asks for, in form order (ADR CM-0013 §3). */
export const LAYOUT_FIELDS: Record<WingLayout, readonly ConfigNumberField[]> = {
  floors: ["floors", "startNumber", "unitsPerFloor", "basements"],
  mixed: [
    "commercialFloors",
    "commercialUnitsPerFloor",
    "residentialFloors",
    "residentialUnitsPerFloor",
    "startNumber",
    "basements",
  ],
  scheme: ["units", "startNumber"],
};

type Bounds = { min: number; max: number; required: boolean; message: string };

const FLOORS: Bounds = {
  min: 0,
  max: WING_FLOORS_MAX,
  required: true,
  message: `Enter 0 to ${String(WING_FLOORS_MAX)} floors`,
};
const PER_FLOOR: Bounds = {
  min: 1,
  max: WING_UNITS_PER_FLOOR_MAX,
  required: true,
  message: `Enter 1 to ${String(WING_UNITS_PER_FLOOR_MAX)} units`,
};

export const FIELD_BOUNDS: Record<ConfigNumberField, Bounds> = {
  floors: FLOORS,
  startNumber: {
    min: 0,
    max: WING_START_NUMBER_MAX,
    required: true,
    message: `Enter 0 to ${String(WING_START_NUMBER_MAX)}`,
  },
  unitsPerFloor: PER_FLOOR,
  basements: {
    min: 0,
    max: WING_BASEMENTS_MAX,
    required: false,
    message: `Enter 0 to ${String(WING_BASEMENTS_MAX)} floors`,
  },
  commercialFloors: FLOORS,
  commercialUnitsPerFloor: PER_FLOOR,
  residentialFloors: FLOORS,
  residentialUnitsPerFloor: PER_FLOOR,
  units: {
    min: 1,
    max: WING_SCHEME_UNITS_MAX,
    required: true,
    message: `Enter 1 to ${WING_SCHEME_UNITS_MAX.toLocaleString("en-IN")}`,
  },
};

/** The label of a configuration field for a Wing Type, as the legacy form says it. */
export function fieldLabel(field: ConfigNumberField, type: WingType): string {
  switch (field) {
    case "floors":
      return type === "individual_unit"
        ? "Floors"
        : `${wingTypeLabel(type)} floors`;
    case "startNumber":
      return "Start number";
    case "unitsPerFloor":
      return "Units per floor";
    case "basements":
      return "Basement parking floors";
    case "commercialFloors":
      return "Commercial floors";
    case "commercialUnitsPerFloor":
      return "Commercial units per floor";
    case "residentialFloors":
      return "Residential floors";
    case "residentialUnitsPerFloor":
      return "Residential units per floor";
    case "units":
      return type === "plotting_scheme"
        ? "Number of plots"
        : "Number of bungalows";
  }
}

export type WingDetailsValues = {
  phaseId: string;
  type: string;
  name: string;
  terrace: boolean;
} & Record<ConfigNumberField, string>;

const WHOLE = /^\d+$/;

/**
 * Add Wing's details: Phase, Wing Type, Wing Name and the Wing Type's
 * configuration. Numbers are typed as text and checked against the same
 * bounds as the domain.
 */
export const wingDetailsSchema = z
  .object({
    phaseId: z.string(),
    type: z.string(),
    name: z
      .string()
      .trim()
      .min(1, "Enter the Wing name")
      .max(WING_NAME_MAX, `Use at most ${String(WING_NAME_MAX)} characters`),
    terrace: z.boolean(),
    floors: z.string(),
    startNumber: z.string(),
    unitsPerFloor: z.string(),
    basements: z.string(),
    commercialFloors: z.string(),
    commercialUnitsPerFloor: z.string(),
    residentialFloors: z.string(),
    residentialUnitsPerFloor: z.string(),
    units: z.string(),
  })
  .superRefine((values, context) => {
    if (!isWingType(values.type)) {
      context.addIssue({
        code: "custom",
        path: ["type"],
        message: "Choose the Wing Type",
      });
      return;
    }
    for (const field of LAYOUT_FIELDS[wingLayout(values.type)]) {
      const bounds = FIELD_BOUNDS[field];
      const raw = values[field].trim();
      if (raw === "" && !bounds.required) continue;
      const value = Number(raw);
      if (!WHOLE.test(raw) || value < bounds.min || value > bounds.max)
        context.addIssue({
          code: "custom",
          path: [field],
          message: bounds.message,
        });
    }
  });

function asText(value: number | null | undefined): string {
  return value == null ? "" : String(value);
}

/** The form for a Wing Type: its defaults, everything else empty. */
export function detailsForType(
  type: WingType,
): Pick<WingDetailsValues, ConfigNumberField | "terrace"> {
  const config = defaultWingConfigInput(type);
  return {
    floors: asText(config.floors),
    startNumber: asText(config.startNumber),
    unitsPerFloor: asText(config.unitsPerFloor),
    basements: asText(config.basements),
    commercialFloors: asText(config.commercialFloors),
    commercialUnitsPerFloor: asText(config.commercialUnitsPerFloor),
    residentialFloors: asText(config.residentialFloors),
    residentialUnitsPerFloor: asText(config.residentialUnitsPerFloor),
    units: asText(config.units),
    terrace: config.terrace ?? true,
  };
}

export function emptyDetails(phaseId: string): WingDetailsValues {
  return {
    phaseId,
    type: "",
    name: "",
    ...detailsForType("commercial"),
  };
}

/** The checked form as the configuration Continue to Units generates from. */
export function configInput(
  type: WingType,
  values: WingDetailsValues,
): WingConfigInput {
  const input: WingConfigInput = {};
  for (const field of LAYOUT_FIELDS[wingLayout(type)]) {
    const raw = values[field].trim();
    input[field] = raw === "" ? null : Number(raw);
  }
  if (wingLayout(type) !== "scheme") input.terrace = values.terrace;
  return input;
}

function plural(value: number, one: string, many: string): string {
  return `${value.toLocaleString("en-IN")} ${value === 1 ? one : many}`;
}

/** "5 Commercial floors from 1 · 4 units per floor · 2 basements · Terrace". */
export function configSummary(type: WingType, config: WingConfig): string {
  if ("units" in config)
    return `${plural(config.units, type === "plotting_scheme" ? "plot" : "bungalow", type === "plotting_scheme" ? "plots" : "bungalows")} from ${String(config.startNumber)}`;
  const parts: string[] = [];
  if ("commercialFloors" in config) {
    parts.push(
      `${plural(config.commercialFloors, "commercial floor", "commercial floors")} × ${String(config.commercialUnitsPerFloor)}`,
      `${plural(config.residentialFloors, "residential floor", "residential floors")} × ${String(config.residentialUnitsPerFloor)}`,
      `from ${String(config.startNumber)}`,
    );
  } else {
    parts.push(
      `${plural(config.floors, "floor", "floors")} from ${String(config.startNumber)}`,
      plural(config.unitsPerFloor, "unit per floor", "units per floor"),
    );
  }
  if (config.basements > 0)
    parts.push(plural(config.basements, "basement", "basements"));
  parts.push(config.terrace ? "Terrace" : "No terrace");
  return parts.join(" · ");
}

export const WING_TYPE_ITEMS = WING_TYPE_KEYS.map((key) => ({
  value: key,
  label: wingTypeLabel(key),
}));
