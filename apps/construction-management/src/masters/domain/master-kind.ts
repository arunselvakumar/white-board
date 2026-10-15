import {
  DomainError,
  conflict,
  notFound,
} from "@/src/shared-kernel/domain-error";

/** The name-only lookup lists: same fields, same rules, their own table. */
export const LOOKUP_KINDS = ["labour_category", "department"] as const;
export type LookupKind = (typeof LOOKUP_KINDS)[number];

/**
 * Whether a Labour Category's heads count as skilled or unskilled on a
 * Daily Worksheet's labour prefill (CM-0016 §6). Only Labour Categories
 * carry one.
 */
export const LABOUR_SKILLS = ["skilled", "unskilled"] as const;
export type LabourSkill = (typeof LABOUR_SKILLS)[number];

/**
 * Amenities and Common Developments (CM-404, ADR CM-0013 §5): name-only
 * rows of one table with a kind, each assigned to Projects.
 */
export const DEVELOPMENT_KINDS = ["amenity", "common_development"] as const;
export type DevelopmentKind = (typeof DEVELOPMENT_KINDS)[number];

/**
 * The procurement masters of M5 (CM-501, ADR CM-0015 §1): Measurement
 * Units are name-only rows; Material Categories, Materials and Terms &
 * Conditions have more fields and their own classes.
 */
export const MATERIAL_MASTER_KINDS = [
  "measurement_unit",
  "material_category",
  "material",
  "terms_condition",
] as const;
export type MaterialMasterKind = (typeof MATERIAL_MASTER_KINDS)[number];

/** Lists whose rows are a name, a seed mark and a disabled mark. */
export type NamedMasterKind = LookupKind | DevelopmentKind | "measurement_unit";

/**
 * The tracking masters (CM-801, ADR CM-0019 §1): Issue Categories (seeded,
 * renamed, disabled, deleted when unused) and Tags (renamed, deleted when
 * unused).
 */
export const TRACKING_MASTER_KINDS = ["issue_category", "tag"] as const;
export type TrackingMasterKind = (typeof TRACKING_MASTER_KINDS)[number];

/** Every masters list this context owns (CM-203, CM-404, CM-501, CM-601, CM-801). */
export type MasterKind =
  | NamedMasterKind
  | "supervisor"
  | MaterialMasterKind
  | "work_type"
  | TrackingMasterKind;

type MasterKindInfo = {
  /** Prefix of the list's error codes: `LABOUR_CATEGORY_NAME_IN_USE`. */
  code: string;
  /** The word on screens. */
  label: string;
  plural: string;
};

export const MASTER_KINDS: Record<MasterKind, MasterKindInfo> = {
  labour_category: {
    code: "LABOUR_CATEGORY",
    label: "Labour Category",
    plural: "Labour Categories",
  },
  department: {
    code: "DEPARTMENT",
    label: "Department",
    plural: "Departments",
  },
  supervisor: {
    code: "SUPERVISOR",
    label: "Supervisor",
    plural: "Supervisors",
  },
  amenity: {
    code: "AMENITY",
    label: "Amenity",
    plural: "Amenities",
  },
  common_development: {
    code: "COMMON_DEVELOPMENT",
    label: "Common Development",
    plural: "Common Developments",
  },
  measurement_unit: {
    code: "MEASUREMENT_UNIT",
    label: "Measurement Unit",
    plural: "Measurement Units",
  },
  material_category: {
    code: "MATERIAL_CATEGORY",
    label: "Material Category",
    plural: "Material Categories",
  },
  material: { code: "MATERIAL", label: "Material", plural: "Materials" },
  terms_condition: {
    code: "TERMS_CONDITION",
    label: "Terms & Conditions",
    plural: "Terms & Conditions",
  },
  work_type: { code: "WORK_TYPE", label: "Work Type", plural: "Work Types" },
  issue_category: {
    code: "ISSUE_CATEGORY",
    label: "Issue Category",
    plural: "Issue Categories",
  },
  tag: { code: "TAG", label: "Tag", plural: "Tags" },
};

export const MASTER_NAME_MAX = 100;

/** Trims and collapses inner spaces; required and at most 100 characters. */
export function cleanMasterName(kind: MasterKind, raw: string): string {
  const { code, label } = MASTER_KINDS[kind];
  const name = raw.trim().replace(/\s+/g, " ");
  if (name.length === 0)
    throw new DomainError(`${code}_NAME_REQUIRED`, `Enter the ${label} name.`);
  if (name.length > MASTER_NAME_MAX)
    throw new DomainError(
      `${code}_NAME_TOO_LONG`,
      `${label} name must be at most ${String(MASTER_NAME_MAX)} characters.`,
    );
  return name;
}

export function masterNotFound(kind: MasterKind): DomainError {
  const { code, label } = MASTER_KINDS[kind];
  return notFound(`${code}_NOT_FOUND`, `This ${label} was not found.`);
}

export function masterNameInUse(kind: MasterKind): DomainError {
  const { code, label } = MASTER_KINDS[kind];
  const article = /^[AEIOU]/.test(label) ? "An" : "A";
  return conflict(
    `${code}_NAME_IN_USE`,
    `${article} ${label} with this name already exists.`,
  );
}

export function masterChanged(kind: MasterKind): DomainError {
  const { code, label } = MASTER_KINDS[kind];
  return conflict(
    `${code}_CHANGED`,
    `Someone else changed this ${label} after you opened it. Reload to see their changes.`,
  );
}

/** Why a row of each procurement master cannot be deleted. */
const MATERIAL_MASTER_USERS: Record<MaterialMasterKind, string> = {
  measurement_unit: "Materials or Tasks use this Measurement Unit",
  material_category: "Materials or sub-categories use this Material Category",
  material:
    "Purchase Requests, Purchase Orders, Goods Receipts, transfers, Material Requests, stock entries, Daily Worksheets or Equipment Usage sheets use this Material",
  terms_condition: "",
};

export function masterInUse(kind: MasterKind): DomainError {
  const { code, label } = MASTER_KINDS[kind];
  if ((MATERIAL_MASTER_KINDS as readonly string[]).includes(kind))
    return conflict(
      `${code}_IN_USE`,
      `${MATERIAL_MASTER_USERS[kind as MaterialMasterKind]}, so it cannot be deleted. Disable it instead.`,
    );
  if (kind === "issue_category")
    return conflict(
      `${code}_IN_USE`,
      "Issues & Snags use this Issue Category, so it cannot be deleted. Disable it instead.",
    );
  if (kind === "tag")
    return conflict(
      `${code}_IN_USE`,
      "Tasks use this Tag, so it cannot be deleted. Take it off those Tasks first.",
    );
  if (kind === "work_type")
    return conflict(
      `${code}_IN_USE`,
      "Daily Worksheets use this Work Type, so it cannot be deleted. Disable it instead.",
    );
  if (kind === "department")
    return conflict(
      `${code}_IN_USE`,
      "Work Types, Daily Worksheets, Equipment Usage sheets, Tasks, Issues & Snags or Inspection Requests use this Department, so it cannot be deleted. Disable it instead.",
    );
  if (kind === "amenity" || kind === "common_development")
    return conflict(
      `${code}_IN_USE`,
      `Projects are assigned this ${label}, so it cannot be deleted. Remove it from those Projects or disable it instead.`,
    );
  const users =
    kind === "supervisor"
      ? "Labours or attendance"
      : "Labours, Vendors or attendance";
  return conflict(
    `${code}_IN_USE`,
    `${users} use this ${label}, so it cannot be deleted. Disable it instead.`,
  );
}
