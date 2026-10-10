import { DomainError } from "@/src/shared-kernel/domain-error";

/**
 * Floor and unit generation for the eight Wing Types (ADR CM-0013 §3).
 * Pure and free of server imports: the Add Wing editor previews exactly
 * what Save will store, and the server checks the same rules again.
 */

export const WING_FLOORS_MAX = 150;
export const WING_START_NUMBER_MAX = 999;
export const WING_UNITS_PER_FLOOR_MAX = 50;
export const WING_BASEMENTS_MAX = 10;
export const WING_SCHEME_UNITS_MAX = 2_000;
/** Units in one Wing, generated or edited. */
export const WING_UNITS_MAX = 5_000;
/** Floors in one Wing, counting terrace, basements and named floors. */
export const WING_FLOOR_ROWS_MAX = 200;
export const WING_FLOOR_NAME_MAX = 60;
export const WING_UNIT_NAME_MAX = 30;

/**
 * How a Wing Type's configuration looks: `floors` (one typed-floor
 * stack), `mixed` (commercial floors under residential ones) or `scheme`
 * (one row of plots or bungalows).
 */
export type WingLayout = "floors" | "mixed" | "scheme";

/** The legacy Add Wing order. */
export const WING_TYPES = [
  {
    key: "commercial",
    label: "Commercial",
    layout: "floors",
    floorLabel: "Commercial Floor",
  },
  {
    key: "residential",
    label: "Residential",
    layout: "floors",
    floorLabel: "Residential Floor",
  },
  {
    key: "bungalow_scheme",
    label: "Bungalow scheme",
    layout: "scheme",
    unitLabel: "Bungalow",
    siteName: "Bungalows",
  },
  {
    key: "residential_and_commercial",
    label: "Residential & Commercial",
    layout: "mixed",
  },
  {
    key: "plotting_scheme",
    label: "Plotting scheme",
    layout: "scheme",
    unitLabel: "Plot",
    siteName: "Plots",
  },
  {
    key: "institutional",
    label: "Institutional",
    layout: "floors",
    floorLabel: "Institutional Floor",
  },
  {
    key: "individual_unit",
    label: "Individual Unit",
    layout: "floors",
    floorLabel: "Floor",
  },
  {
    key: "industrial",
    label: "Industrial",
    layout: "floors",
    floorLabel: "Industrial Floor",
  },
] as const satisfies readonly {
  key: string;
  label: string;
  layout: WingLayout;
  floorLabel?: string;
  unitLabel?: string;
  siteName?: string;
}[];

export type WingType = (typeof WING_TYPES)[number]["key"];

export const WING_TYPE_KEYS: readonly WingType[] = WING_TYPES.map(
  (type) => type.key,
);

export function isWingType(value: string): value is WingType {
  return (WING_TYPE_KEYS as readonly string[]).includes(value);
}

function wingTypeOf(type: WingType) {
  const found = WING_TYPES.find((item) => item.key === type);
  if (found == null)
    throw new DomainError("WING_TYPE_INVALID", "Choose a Wing Type.");
  return found;
}

export function wingTypeLabel(type: WingType): string {
  return wingTypeOf(type).label;
}

export function wingLayout(type: WingType): WingLayout {
  return wingTypeOf(type).layout;
}

/** What "Plots" / "Bungalows" a scheme's units are called, singular. */
export function schemeUnitLabel(type: WingType): string | null {
  const found = wingTypeOf(type);
  return "unitLabel" in found ? found.unitLabel : null;
}

/**
 * Where a floor sits (ADR CM-0013 §3): `site` is the one row of a
 * bungalow or plotting scheme; `other` is a stilt, podium or mezzanine
 * floor added in the editor.
 */
export const FLOOR_KINDS = [
  "terrace",
  "typed",
  "ground",
  "basement",
  "site",
  "other",
] as const;

export type FloorKind = (typeof FLOOR_KINDS)[number];

export function isFloorKind(value: string): value is FloorKind {
  return (FLOOR_KINDS as readonly string[]).includes(value);
}

/** A typed-floor stack: Commercial, Residential, Institutional, Industrial, Individual Unit. */
export type FloorsWingConfig = {
  floors: number;
  startNumber: number;
  unitsPerFloor: number;
  basements: number;
  terrace: boolean;
};

/** Residential & Commercial: commercial floors directly above Ground, residential above them. */
export type MixedWingConfig = {
  commercialFloors: number;
  commercialUnitsPerFloor: number;
  residentialFloors: number;
  residentialUnitsPerFloor: number;
  startNumber: number;
  basements: number;
  terrace: boolean;
};

/** Bungalow or plotting scheme: how many, numbered from the start number. */
export type SchemeWingConfig = { units: number; startNumber: number };

/** The configuration a Wing was generated from, kept to show on Edit. */
export type WingConfig = FloorsWingConfig | MixedWingConfig | SchemeWingConfig;

/** What the Add Wing form sends; only the Wing Type's fields are read. */
export type WingConfigInput = {
  floors?: number | null;
  startNumber?: number | null;
  unitsPerFloor?: number | null;
  basements?: number | null;
  terrace?: boolean | null;
  commercialFloors?: number | null;
  commercialUnitsPerFloor?: number | null;
  residentialFloors?: number | null;
  residentialUnitsPerFloor?: number | null;
  units?: number | null;
};

export type WingConfigField = keyof WingConfigInput;

function configError(
  code: string,
  message: string,
  field: WingConfigField,
): DomainError {
  return new DomainError(code, message, { details: { field } });
}

function whole(
  input: WingConfigInput,
  field: WingConfigField,
  bounds: { min: number; max: number; fallback?: number },
  code: string,
  message: string,
): number {
  const raw = input[field];
  if (raw == null) {
    if (bounds.fallback !== undefined) return bounds.fallback;
    throw configError(code, message, field);
  }
  if (
    typeof raw !== "number" ||
    !Number.isInteger(raw) ||
    raw < bounds.min ||
    raw > bounds.max
  )
    throw configError(code, message, field);
  return raw;
}

const FLOORS_MESSAGE = `Enter 0 to ${String(WING_FLOORS_MAX)} floors.`;
const START_MESSAGE = `Start number must be 0 to ${String(WING_START_NUMBER_MAX)}.`;
const PER_FLOOR_MESSAGE = `Units per floor must be 1 to ${String(WING_UNITS_PER_FLOOR_MAX)}.`;
const BASEMENTS_MESSAGE = `Basement floors must be 0 to ${String(WING_BASEMENTS_MAX)}.`;

function floorsField(input: WingConfigInput, field: WingConfigField): number {
  return whole(
    input,
    field,
    { min: 0, max: WING_FLOORS_MAX },
    "WING_FLOORS_INVALID",
    FLOORS_MESSAGE,
  );
}

function perFloorField(input: WingConfigInput, field: WingConfigField): number {
  return whole(
    input,
    field,
    { min: 1, max: WING_UNITS_PER_FLOOR_MAX },
    "WING_UNITS_PER_FLOOR_INVALID",
    PER_FLOOR_MESSAGE,
  );
}

function startField(input: WingConfigInput, fallback?: number): number {
  return whole(
    input,
    "startNumber",
    { min: 0, max: WING_START_NUMBER_MAX, fallback },
    "WING_START_NUMBER_INVALID",
    START_MESSAGE,
  );
}

function basementsField(input: WingConfigInput): number {
  return whole(
    input,
    "basements",
    { min: 0, max: WING_BASEMENTS_MAX, fallback: 0 },
    "WING_BASEMENTS_INVALID",
    BASEMENTS_MESSAGE,
  );
}

function tooManyUnits(): DomainError {
  return new DomainError(
    "WING_TOO_MANY_UNITS",
    `A Wing holds at most ${WING_UNITS_MAX.toLocaleString("en-IN")} units.`,
  );
}

/**
 * Checks the Add Wing configuration of a Wing Type: typed floors 0–150,
 * start number 0–999, units per floor 1–50, basements 0–10 (default 0),
 * terrace on unless turned off, scheme units 1–2,000 (start number default
 * 1); at most 5,000 units in all. 400 with `details.field` naming the field.
 */
export function wingConfig(type: WingType, input: WingConfigInput): WingConfig {
  const layout = wingLayout(type);
  if (layout === "scheme") {
    return {
      units: whole(
        input,
        "units",
        { min: 1, max: WING_SCHEME_UNITS_MAX },
        "WING_SCHEME_UNITS_INVALID",
        `Number of units must be 1 to ${WING_SCHEME_UNITS_MAX.toLocaleString("en-IN")}.`,
      ),
      startNumber: startField(input, 1),
    };
  }
  if (layout === "mixed") {
    const config: MixedWingConfig = {
      commercialFloors: floorsField(input, "commercialFloors"),
      commercialUnitsPerFloor: perFloorField(input, "commercialUnitsPerFloor"),
      residentialFloors: floorsField(input, "residentialFloors"),
      residentialUnitsPerFloor: perFloorField(
        input,
        "residentialUnitsPerFloor",
      ),
      startNumber: startField(input),
      basements: basementsField(input),
      terrace: input.terrace ?? true,
    };
    if (config.commercialFloors + config.residentialFloors > WING_FLOORS_MAX)
      throw configError(
        "WING_FLOORS_INVALID",
        `Commercial and residential floors together must be at most ${String(WING_FLOORS_MAX)}.`,
        "residentialFloors",
      );
    if (
      config.commercialUnitsPerFloor * (config.commercialFloors + 1) +
        config.residentialUnitsPerFloor * config.residentialFloors >
      WING_UNITS_MAX
    )
      throw tooManyUnits();
    return config;
  }
  const config: FloorsWingConfig = {
    floors: floorsField(input, "floors"),
    startNumber: startField(input),
    unitsPerFloor: perFloorField(input, "unitsPerFloor"),
    basements: basementsField(input),
    terrace: input.terrace ?? true,
  };
  if (config.unitsPerFloor * (config.floors + 1) > WING_UNITS_MAX)
    throw tooManyUnits();
  return config;
}

/**
 * What the Add Wing form starts with for a Wing Type: start number 1,
 * no basements, terrace on; Individual Unit has one unit per floor.
 */
export function defaultWingConfigInput(type: WingType): WingConfigInput {
  const layout = wingLayout(type);
  if (layout === "scheme") return { units: null, startNumber: 1 };
  if (layout === "mixed")
    return {
      commercialFloors: null,
      commercialUnitsPerFloor: null,
      residentialFloors: null,
      residentialUnitsPerFloor: null,
      startNumber: 1,
      basements: 0,
      terrace: true,
    };
  return {
    floors: null,
    startNumber: 1,
    unitsPerFloor: type === "individual_unit" ? 1 : null,
    basements: 0,
    terrace: true,
  };
}

/** One generated floor, top to bottom, with its unit names. */
export type GeneratedFloor = {
  kind: FloorKind;
  name: string;
  units: string[];
};

function twoDigits(position: number): string {
  return String(position).padStart(2, "0");
}

/** `101`, `102` …; Ground `G01`. */
function unitNames(prefix: string, count: number): string[] {
  return Array.from(
    { length: count },
    (_, index) => `${prefix}${twoDigits(index + 1)}`,
  );
}

function typedFloors(
  label: string,
  from: number,
  count: number,
  unitsPerFloor: number,
): GeneratedFloor[] {
  const floors: GeneratedFloor[] = [];
  for (let number = from + count - 1; number >= from; number -= 1)
    floors.push({
      kind: "typed",
      name: `${label} ${String(number)}`,
      units: unitNames(String(number), unitsPerFloor),
    });
  return floors;
}

function stack(input: {
  terrace: boolean;
  upper: GeneratedFloor[];
  groundUnits: number;
  basements: number;
}): GeneratedFloor[] {
  const floors: GeneratedFloor[] = [];
  if (input.terrace)
    floors.push({ kind: "terrace", name: "Terrace Floor", units: [] });
  floors.push(...input.upper);
  floors.push({
    kind: "ground",
    name: "Ground Floor",
    units: unitNames("G", input.groundUnits),
  });
  for (let number = input.basements; number >= 1; number -= 1)
    floors.push({
      kind: "basement",
      name: `Basement Floor ${String(number)}`,
      units: [],
    });
  return floors;
}

/**
 * Continue to Units: the floors and units of a checked configuration, top
 * to bottom (ADR CM-0013 §3). A floor stack is Terrace (no units), typed
 * floors from the highest number down to the start number, Ground (units)
 * and Basement N … 1 (no units); Residential & Commercial puts the
 * commercial floors directly above Ground and numbers the residential ones
 * on from them. A scheme is one `site` floor of "Plot 1" … or "Bungalow 1" ….
 */
export function generateWingFloors(
  type: WingType,
  config: WingConfig,
): GeneratedFloor[] {
  const definition = wingTypeOf(type);
  if ("units" in config) {
    const unitLabel = "unitLabel" in definition ? definition.unitLabel : "Unit";
    const siteName = "siteName" in definition ? definition.siteName : "Units";
    return [
      {
        kind: "site",
        name: siteName,
        units: Array.from(
          { length: config.units },
          (_, index) => `${unitLabel} ${String(config.startNumber + index)}`,
        ),
      },
    ];
  }
  if ("commercialFloors" in config) {
    const residentialFrom = config.startNumber + config.commercialFloors;
    return stack({
      terrace: config.terrace,
      upper: [
        ...typedFloors(
          "Residential Floor",
          residentialFrom,
          config.residentialFloors,
          config.residentialUnitsPerFloor,
        ),
        ...typedFloors(
          "Commercial Floor",
          config.startNumber,
          config.commercialFloors,
          config.commercialUnitsPerFloor,
        ),
      ],
      groundUnits: config.commercialUnitsPerFloor,
      basements: config.basements,
    });
  }
  const label = "floorLabel" in definition ? definition.floorLabel : "Floor";
  return stack({
    terrace: config.terrace,
    upper: typedFloors(
      label,
      config.startNumber,
      config.floors,
      config.unitsPerFloor,
    ),
    groundUnits: config.unitsPerFloor,
    basements: config.basements,
  });
}

/** Floors and units in a list of floors. */
export function wingTotals(floors: readonly { units: readonly unknown[] }[]): {
  floors: number;
  units: number;
} {
  return {
    floors: floors.length,
    units: floors.reduce((sum, floor) => sum + floor.units.length, 0),
  };
}

/** Spaces tidied; the comparison key for names unique ignoring case. */
export function tidyName(raw: string): string {
  return raw.trim().replace(/\s+/g, " ");
}

export function nameKey(name: string): string {
  return tidyName(name).toLocaleLowerCase("en-IN");
}

/**
 * The name "+ Add" puts on a new unit: the floor's last unit with its
 * trailing number moved on (`1204` → `1205`, `Plot 12` → `Plot 13`), or
 * for an empty floor its code and `01` (`G01`, `B101`, `T01`, `1201`, `S01`
 * for "Stilt Floor", `Plot 1`), skipping names already in the Wing.
 */
export function suggestUnitName(
  floor: { kind: FloorKind; name: string; units: readonly { name: string }[] },
  wingUnitNames: Iterable<string>,
): string {
  const taken = new Set([...wingUnitNames].map(nameKey));
  const last = floor.units.at(-1)?.name;
  let prefix: string;
  let next: number;
  let width: number;
  const trailing = last == null ? null : /^(.*?)(\d+)$/.exec(tidyName(last));
  if (trailing != null) {
    prefix = trailing[1] ?? "";
    const digits = trailing[2] ?? "1";
    next = Number(digits) + 1;
    width = digits.length;
  } else {
    const floorNumber = /(\d+)$/.exec(floor.name)?.[1] ?? "";
    const name = tidyName(floor.name);
    const codes: Record<FloorKind, string> = {
      terrace: "T",
      typed: floorNumber,
      ground: "G",
      basement: `B${floorNumber}`,
      site: `${name.replace(/s$/i, "")} `,
      other: name.charAt(0).toUpperCase() || "U",
    };
    prefix = codes[floor.kind];
    next = 1;
    width = floor.kind === "site" ? 1 : 2;
  }
  for (;;) {
    const candidate = `${prefix}${String(next).padStart(width, "0")}`;
    if (!taken.has(nameKey(candidate))) return candidate;
    next += 1;
  }
}
