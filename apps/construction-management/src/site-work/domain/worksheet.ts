import {
  approve,
  optionalText,
  pendingState,
  reject,
  type Decider,
} from "@/src/shared-kernel/approval";
import type { CalendarDate } from "@/src/shared-kernel/calendar-date";
import { conflict, DomainError } from "@/src/shared-kernel/domain-error";
import type { LocationRef } from "@/src/shared-kernel/location-ref";
import { Quantity } from "@/src/shared-kernel/quantity";

import { WORK_SHIFTS, type SheetApprovalStatus, type WorkShift } from "./shift";
import { SITE_WORK_DOCUMENTS } from "./site-work-documents";

/**
 * Daily Worksheets (CM-602, ADR CM-0016 §2, §3, §5–§7, §9): what one
 * Contractor's crew did on a Project on a date and shift — where, how many
 * heads, how much work and which materials it consumed. The Project's
 * worksheet settings decide which sections the form shows and whether a
 * sheet needs approval. Pure rules; the handlers load the facts.
 */

export const WORKSHEET = SITE_WORK_DOCUMENTS.worksheet.naming;

// ---------------------------------------------------------------------------
// Settings (§2)
// ---------------------------------------------------------------------------

/** The four sections of the form, in their default order. */
export const WORKSHEET_SECTIONS = [
  "location",
  "basic",
  "materials",
  "other",
] as const;
export type WorksheetSection = (typeof WORKSHEET_SECTIONS)[number];

export const WORKSHEET_SECTION_LABELS: Record<WorksheetSection, string> = {
  location: "Location Details",
  basic: "Basic Details",
  materials: "Material Consumption",
  other: "Other Details",
};

export type WorksheetSettings = {
  showLocation: boolean;
  showWorkType: boolean;
  showApproxWorkDone: boolean;
  showLabour: boolean;
  showMaterials: boolean;
  showRemark: boolean;
  showPhotos: boolean;
  sectionOrder: WorksheetSection[];
  approvalEnabled: boolean;
};

/** A Project without saved settings: everything shown, approval off. */
export const DEFAULT_WORKSHEET_SETTINGS: Readonly<WorksheetSettings> =
  Object.freeze({
    showLocation: true,
    showWorkType: true,
    showApproxWorkDone: true,
    showLabour: true,
    showMaterials: true,
    showRemark: true,
    showPhotos: true,
    sectionOrder: [...WORKSHEET_SECTIONS],
    approvalEnabled: false,
  });

export function isWorksheetSection(value: string): value is WorksheetSection {
  return (WORKSHEET_SECTIONS as readonly string[]).includes(value);
}

/** Settings to save: the section order names each of the four sections once. */
export function worksheetSettings(
  input: Omit<WorksheetSettings, "sectionOrder"> & {
    sectionOrder: readonly string[];
  },
): WorksheetSettings {
  const order = input.sectionOrder;
  const valid =
    order.length === WORKSHEET_SECTIONS.length &&
    new Set(order).size === order.length &&
    order.every(isWorksheetSection);
  if (!valid)
    throw new DomainError(
      "SECTION_ORDER_INVALID",
      "Put each of the four sections in the order once.",
      { details: { field: "sectionOrder" } },
    );
  return { ...input, sectionOrder: [...order] as WorksheetSection[] };
}

// ---------------------------------------------------------------------------
// Content (§5–§7)
// ---------------------------------------------------------------------------

export const WORKSHEET_LIMITS = {
  /**
   * Material lines on one sheet. Zero is allowed: a crew often consumes
   * nothing (shuttering, curing), and neither the spec nor CM-0016 asks for
   * a line. Raise to 1 to require one whenever the section is shown.
   */
  minMaterials: 0,
  maxMaterials: 100,
  /** Heads of one skill on one sheet. */
  maxCount: 10_000,
  /** `decimal(14,3)`: eleven whole digits. */
  maxQuantityMilli: 10n ** 14n - 1n,
} as const;

/** What a material line copies from the Material master at save. */
export type WorksheetMaterialFacts = {
  id: string;
  name: string;
  unitName: string;
  disabled: boolean;
};

export type WorksheetLineInput = {
  materialId: string;
  quantity: string;
  remark?: string | null;
};

export type WorksheetLine = {
  materialId: string;
  materialName: string;
  unitName: string;
  /** Decimal string with three decimals. */
  quantity: string;
  remark: string | null;
};

export type WorksheetInput = {
  sheetDate: CalendarDate;
  shift: string;
  contractorId?: string | null;
  departmentId?: string | null;
  workTypeId?: string | null;
  skilledCount?: number | null;
  unskilledCount?: number | null;
  approxWorkQty?: string | null;
  approxWorkUnitId?: string | null;
  /** Already shaped by `locationRef`; the resolver checks the Project. */
  siteLocation?: LocationRef | null;
  remark?: string | null;
  materials?: readonly WorksheetLineInput[];
};

/** What the save writes (besides number, approval and bookkeeping). */
export type WorksheetContent = {
  sheetDate: CalendarDate;
  shift: WorkShift;
  contractorId: string;
  departmentId: string;
  workTypeId: string | null;
  skilledCount: number | null;
  unskilledCount: number | null;
  approxWorkQty: string | null;
  approxWorkUnitId: string | null;
  siteLocation: LocationRef | null;
  remark: string | null;
  lines: WorksheetLine[];
};

/** The master facts the rules read, loaded by the handler for the input's ids. */
export type WorksheetFacts = {
  contractor: {
    id: string;
    isActive: boolean;
    onProject: boolean;
    departmentIds: readonly string[];
  } | null;
  department: { id: string; disabled: boolean } | null;
  workType: { id: string; departmentId: string; disabled: boolean } | null;
  unit: { id: string; disabled: boolean } | null;
  materials: ReadonlyMap<string, WorksheetMaterialFacts>;
};

function invalid(
  code: string,
  message: string,
  details: Record<string, unknown>,
): DomainError {
  return new DomainError(code, message, { details });
}

function blank(value: string | null | undefined): boolean {
  return value == null || value.trim() === "";
}

/**
 * A quantity > 0 with at most three decimals that fits `decimal(14,3)`, as
 * `12.500`; 400 `code` with `details`.
 */
function positiveQuantity(
  raw: string,
  code: string,
  details: Record<string, unknown>,
): string {
  let quantity: Quantity;
  try {
    quantity = Quantity.of(raw.trim(), "worksheet");
  } catch {
    throw invalid(
      code,
      "Enter a quantity with at most three decimals.",
      details,
    );
  }
  if (!quantity.isPositive())
    throw invalid(code, "Enter a quantity more than 0.", details);
  if (quantity.toMilli() > WORKSHEET_LIMITS.maxQuantityMilli)
    throw invalid(code, "This quantity is too large.", details);
  return quantity.toDecimalString();
}

function headcount(
  value: number | null | undefined,
  field: "skilledCount" | "unskilledCount",
): number {
  const count = value ?? 0;
  if (
    !Number.isInteger(count) ||
    count < 0 ||
    count > WORKSHEET_LIMITS.maxCount
  )
    throw invalid(
      "LABOUR_COUNT_INVALID",
      "Enter a whole number of 0 or more.",
      { field },
    );
  return count;
}

/** The material lines: 0–100, each Material once, live and enabled, quantity > 0. */
export function worksheetLines(
  inputs: readonly WorksheetLineInput[],
  materials: ReadonlyMap<string, WorksheetMaterialFacts>,
  keep: readonly WorksheetLine[] = [],
): WorksheetLine[] {
  if (inputs.length < WORKSHEET_LIMITS.minMaterials)
    throw invalid("MATERIALS_REQUIRED", "Add at least one material.", {
      field: "materials",
    });
  if (inputs.length > WORKSHEET_LIMITS.maxMaterials)
    throw invalid(
      "TOO_MANY_MATERIALS",
      `Add at most ${String(WORKSHEET_LIMITS.maxMaterials)} materials.`,
      { field: "materials" },
    );
  const seen = new Set<string>();
  const repeated = inputs
    .map((input) => input.materialId)
    .filter((id) => (seen.has(id) ? true : (seen.add(id), false)));
  if (repeated.length > 0)
    throw invalid(
      "MATERIAL_REPEATED",
      "Each material can be on the sheet once. Change its quantity instead.",
      { field: "materialId", ids: [...new Set(repeated)] },
    );
  // A material already on the sheet stays usable after it is disabled.
  const kept = new Set(keep.map((line) => line.materialId));
  const missing = inputs
    .map((input) => input.materialId)
    .filter((id) => {
      const material = materials.get(id);
      return material == null || (material.disabled && !kept.has(id));
    });
  if (missing.length > 0)
    throw invalid(
      "MATERIAL_NOT_FOUND",
      "Some materials were not found or are disabled. Choose them again.",
      { field: "materialId", ids: missing },
    );
  return inputs.map((input, index) => {
    const material = materials.get(input.materialId);
    if (material == null) throw new Error("checked above");
    return {
      materialId: material.id,
      materialName: material.name,
      unitName: material.unitName,
      quantity: positiveQuantity(input.quantity, "QUANTITY_INVALID", {
        field: "quantity",
        index,
      }),
      remark: optionalText(input.remark, "remark"),
    };
  });
}

/**
 * The content a create or an edit saves (§2, §7). Contractor\*, Department\*
 * and Work Shift\* always; each shown section is validated and stored, and
 * a hidden one is neither: it keeps what the sheet already had (`previous`,
 * on edit) or stays empty (create). Ids the facts do not know are 400
 * `*_NOT_FOUND` with `details.field`; a disabled master is refused unless
 * the sheet already named it.
 */
export function worksheetContent(
  input: WorksheetInput,
  settings: WorksheetSettings,
  facts: WorksheetFacts,
  previous: WorksheetContent | null = null,
): WorksheetContent {
  const shift = input.shift as WorkShift;
  if (!WORK_SHIFTS.includes(shift))
    throw invalid("WORK_SHIFT_REQUIRED", "Choose the Work Shift.", {
      field: "shift",
    });

  // Contractor* on the Project (Resources), then one of its Departments.
  if (blank(input.contractorId))
    throw invalid("CONTRACTOR_REQUIRED", "Choose the Contractor.", {
      field: "contractorId",
    });
  const contractor = facts.contractor;
  const sameContractor = previous?.contractorId === input.contractorId;
  if (contractor == null || (!contractor.isActive && !sameContractor))
    throw invalid("CONTRACTOR_NOT_FOUND", "This Contractor was not found.", {
      field: "contractorId",
    });
  if (!contractor.onProject)
    throw invalid(
      "CONTRACTOR_NOT_ON_PROJECT",
      "This Contractor is not assigned to the Project. Add them under Resources first.",
      { field: "contractorId" },
    );
  if (blank(input.departmentId))
    throw invalid("DEPARTMENT_REQUIRED", "Choose the Department.", {
      field: "departmentId",
    });
  const department = facts.department;
  const sameDepartment = previous?.departmentId === input.departmentId;
  if (department == null || (department.disabled && !sameDepartment))
    throw invalid("DEPARTMENT_NOT_FOUND", "This Department was not found.", {
      field: "departmentId",
    });
  if (!contractor.departmentIds.includes(department.id))
    throw invalid(
      "DEPARTMENT_NOT_CONTRACTORS",
      "This Department is not one of the Contractor's Departments.",
      { field: "departmentId" },
    );

  // Location: required when shown.
  let siteLocation = previous?.siteLocation ?? null;
  if (settings.showLocation) {
    if (input.siteLocation == null)
      throw invalid("LOCATION_REQUIRED", "Choose where the work was done.", {
        field: "siteLocation",
      });
    siteLocation = input.siteLocation;
  }

  // Work Type: optional, of the Department.
  let workTypeId = previous?.workTypeId ?? null;
  if (settings.showWorkType) {
    workTypeId = null;
    if (!blank(input.workTypeId)) {
      const workType = facts.workType;
      const same = previous?.workTypeId === input.workTypeId;
      if (workType == null || (workType.disabled && !same))
        throw invalid("WORK_TYPE_NOT_FOUND", "This Work Type was not found.", {
          field: "workTypeId",
        });
      if (workType.departmentId !== department.id)
        throw invalid(
          "WORK_TYPE_NOT_DEPARTMENTS",
          "This Work Type belongs to another Department.",
          { field: "workTypeId" },
        );
      workTypeId = workType.id;
    }
  }

  // Labour: two counts, at least one above zero (§6).
  let skilledCount = previous?.skilledCount ?? null;
  let unskilledCount = previous?.unskilledCount ?? null;
  if (settings.showLabour) {
    skilledCount = headcount(input.skilledCount, "skilledCount");
    unskilledCount = headcount(input.unskilledCount, "unskilledCount");
    if (skilledCount + unskilledCount === 0)
      throw invalid(
        "LABOUR_COUNT_REQUIRED",
        "Enter the skilled or unskilled headcount.",
        { field: "skilledCount" },
      );
  }

  // Approx Work Done: a quantity needs a unit.
  let approxWorkQty = previous?.approxWorkQty ?? null;
  let approxWorkUnitId = previous?.approxWorkUnitId ?? null;
  if (settings.showApproxWorkDone) {
    approxWorkQty = null;
    approxWorkUnitId = null;
    if (!blank(input.approxWorkQty)) {
      approxWorkQty = positiveQuantity(
        input.approxWorkQty ?? "",
        "APPROX_WORK_QTY_INVALID",
        { field: "approxWorkQty" },
      );
      if (blank(input.approxWorkUnitId))
        throw invalid(
          "APPROX_WORK_UNIT_REQUIRED",
          "Choose the unit of the work done.",
          { field: "approxWorkUnitId" },
        );
      const unit = facts.unit;
      const same = previous?.approxWorkUnitId === input.approxWorkUnitId;
      if (unit == null || (unit.disabled && !same))
        throw invalid("UNIT_NOT_FOUND", "This unit was not found.", {
          field: "approxWorkUnitId",
        });
      approxWorkUnitId = unit.id;
    }
  }

  const lines = settings.showMaterials
    ? worksheetLines(
        input.materials ?? [],
        facts.materials,
        previous?.lines ?? [],
      )
    : (previous?.lines ?? []);

  const remark = settings.showRemark
    ? optionalText(input.remark, "remark")
    : (previous?.remark ?? null);

  return {
    sheetDate: input.sheetDate,
    shift,
    contractorId: contractor.id,
    departmentId: department.id,
    workTypeId,
    skilledCount,
    unskilledCount,
    approxWorkQty,
    approxWorkUnitId,
    siteLocation,
    remark,
    lines,
  };
}

/** A sheet date is never in the future (the date stepper stops at today). */
export function assertSheetDateNotFuture(
  sheetDate: CalendarDate,
  today: CalendarDate,
): void {
  if (sheetDate > today)
    throw invalid(
      "SHEET_DATE_IN_FUTURE",
      "A Daily Worksheet cannot be dated after today.",
      { field: "sheetDate" },
    );
}

// ---------------------------------------------------------------------------
// Approval (§3)
// ---------------------------------------------------------------------------

export type WorksheetApproval = {
  status: SheetApprovalStatus;
  decidedAt: Date | null;
  decidedBy: string | null;
  rejectionReason: string | null;
};

/**
 * The approval a save leaves (create and edit alike): `not_required` with
 * the Project's approval off; otherwise `pending`, or `approved` for Save
 * & Approve. So editing an approved or rejected sheet sends it back to
 * pending, and an edit under approval off clears the old decision.
 */
export function savedApproval(
  approvalEnabled: boolean,
  approveNow: boolean,
  by: Decider,
): WorksheetApproval {
  if (!approvalEnabled)
    return {
      status: "not_required",
      decidedAt: null,
      decidedBy: null,
      rejectionReason: null,
    };
  return approveNow
    ? {
        status: "approved",
        decidedAt: by.at,
        decidedBy: by.userId,
        rejectionReason: null,
      }
    : { ...pendingState() };
}

/**
 * Approve, or reject with a reason: only a pending sheet (409
 * `WORKSHEET_NOT_PENDING`); the reason is required, ≤ 500.
 */
export function decideWorksheet(
  current: WorksheetApproval,
  decision: { approve: true } | { approve: false; reason: string },
  by: Decider,
): WorksheetApproval {
  if (current.status !== "pending")
    throw conflict(
      `${WORKSHEET.code}_NOT_PENDING`,
      current.status === "not_required"
        ? `This ${WORKSHEET.label} does not need approval.`
        : `This ${WORKSHEET.label} is ${current.status}, not pending.`,
      { status: current.status },
    );
  const pending = { ...current, status: "pending" as const };
  return decision.approve
    ? approve(pending, by, WORKSHEET)
    : reject(pending, by, decision.reason, WORKSHEET);
}

// ---------------------------------------------------------------------------
// Labour prefill (§6)
// ---------------------------------------------------------------------------

export type LabourSkill = "skilled" | "unskilled";
export type Headcount = { skilled: number; unskilled: number };

/**
 * Heads from one attendance source, grouped by the Labour Category's skill
 * (null: no category). Labour attendance gives one head per labourer present
 * or on a half day; vendor attendance gives full-day plus half-day heads.
 */
export type AttendanceHeads = { skill: LabourSkill | null; heads: number };

/** Attendance heads by skill; a labourer with no category counts as unskilled. */
export function attendanceHeadcount(
  rows: readonly AttendanceHeads[],
): Headcount {
  const total: Headcount = { skilled: 0, unskilled: 0 };
  for (const row of rows) total[row.skill ?? "unskilled"] += row.heads;
  return total;
}

export type LabourPrefill = {
  attendance: Headcount;
  onWorksheets: Headcount;
  remaining: Headcount;
};

/**
 * What the form shows next to the counts: the day's attendance, the heads
 * already on the Project's other live worksheets that date, and what is
 * left (never below zero) — what **Use remaining** fills. Shown, not
 * enforced.
 */
export function labourPrefill(
  attendance: Headcount,
  onWorksheets: Headcount,
): LabourPrefill {
  return {
    attendance,
    onWorksheets,
    remaining: {
      skilled: Math.max(0, attendance.skilled - onWorksheets.skilled),
      unskilled: Math.max(0, attendance.unskilled - onWorksheets.unskilled),
    },
  };
}

// ---------------------------------------------------------------------------
// Duplicate and Save & Add New (§9)
// ---------------------------------------------------------------------------

/**
 * What Duplicate copies into a new form: everything but photos and
 * approval, dated today.
 */
export function duplicateOf(
  source: WorksheetContent,
  today: CalendarDate,
): WorksheetContent {
  return {
    ...source,
    sheetDate: today,
    lines: source.lines.map((line) => ({ ...line })),
  };
}

/** What Save & Add New keeps: the date, location, contractor and shift. */
export function addNewFrom(content: {
  sheetDate: CalendarDate;
  siteLocation: LocationRef | null;
  contractorId: string;
  shift: WorkShift;
}): {
  sheetDate: CalendarDate;
  siteLocation: LocationRef | null;
  contractorId: string;
  shift: WorkShift;
} {
  return {
    sheetDate: content.sheetDate,
    siteLocation: content.siteLocation,
    contractorId: content.contractorId,
    shift: content.shift,
  };
}
