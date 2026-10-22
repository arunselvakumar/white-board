import {
  requiredText,
  type DocumentNaming,
} from "@/src/shared-kernel/approval";
import {
  assertCalendarDate,
  daysBetween,
  type CalendarDate,
} from "@/src/shared-kernel/calendar-date";
import {
  DomainError,
  conflict,
  notFound,
} from "@/src/shared-kernel/domain-error";

import {
  BOQ_AMOUNT_MAX,
  BOQ_ITEM_DESCRIPTION_MAX,
  BOQ_ITEM_NO_MAX,
  boqAmount,
  boqQuantity,
  quantityText,
} from "./boq";
import {
  ISSUE_BASES,
  TDS_NATURES,
  type IssueBasis,
  type TdsNature,
  type WorkOrderLineKind,
  type WorkOrderStatus,
} from "./contract-terms";
import { isValidSacHsn } from "./item";
import {
  COEFFICIENT_MAX,
  COEFFICIENT_SCALE,
  PERCENT_SCALE,
  paise,
  scaledDecimal,
} from "./item-analysis";

/**
 * A Work Order (CM-1104, ADR CM-0023 §5): what a Contractor is given to
 * do on a Project, at what rate and on what terms. Its lines are BOQ items
 * at the work-order rate, or non-BOQ lines for labour-only or extra work.
 * Quantities are ten-thousandths of the line's UoM, rates paise per UoM,
 * a line's amount `round(quantity × rate)` (half up) and the Work Order's
 * value the sum of its rounded lines. Percentages are hundredths.
 *
 * Life: **draft** (free edit and delete) → submit → **pending approval**
 * → approve → **issued**, or reject → back to draft with the reason.
 * An issued Work Order is changed by an **amendment** (a new revision, the
 * old one kept), and ends **closed** or **cancelled**.
 */

export const WORK_ORDER_NAMING: DocumentNaming = {
  code: "WORK_ORDER",
  label: "Work Order",
};

export const WORK_ORDER_SCOPE_MAX = 4000;
export const WORK_ORDER_LINES_MAX = 500;
export const WORK_ORDER_MATERIALS_MAX = 100;
export const DLP_MONTHS_MAX = 120;
/** Hundredths: GST is 0 to 28 %. */
export const WORK_ORDER_GST_RATE_MAX = 2800n;
/** Hundredths: every other percentage is 0 to 100 %. */
const PERCENT_MAX = 10_000n;
/** Hundredths: half the retention is released on completion by default (CM-0023 §8). */
export const RETENTION_COMPLETION_DEFAULT = 5000n;

function field(code: string, message: string, name: string): DomainError {
  return new DomainError(code, message, { details: { field: name } });
}

function lineField(
  code: string,
  message: string,
  line: number,
  name: string,
): DomainError {
  return new DomainError(code, message, {
    details: { line, field: `lines.${String(line)}.${name}` },
  });
}

function materialField(
  code: string,
  message: string,
  material: number,
  name: string,
): DomainError {
  return new DomainError(code, message, {
    details: { material, field: `materials.${String(material)}.${name}` },
  });
}

function given(
  raw: string | number | null | undefined,
): raw is string | number {
  return raw != null && !(typeof raw === "string" && raw.trim() === "");
}

function oneLine(raw: string | null | undefined): string | null {
  const value = raw?.trim().replace(/\s+/g, " ") ?? "";
  return value === "" ? null : value;
}

/** A percentage with two places, from 0 to `max` hundredths; null when not one. */
function percentOf(raw: string | number, max: bigint): bigint | null {
  const value = scaledDecimal(raw, PERCENT_SCALE);
  if (value == null || value < 0n || value > max) return null;
  return value;
}

// ---------------------------------------------------------------------------
// Header
// ---------------------------------------------------------------------------

export type WorkOrderHeaderInput = {
  orderDate: string;
  validUntil?: string | null;
  scope?: string | null;
};

export type WorkOrderHeader = {
  orderDate: CalendarDate;
  validUntil: CalendarDate | null;
  /** The scope note; keeps its line breaks. */
  scope: string | null;
};

/** The order date, an optional valid-until on or after it, and the scope note. */
export function workOrderHeader(input: WorkOrderHeaderInput): WorkOrderHeader {
  const orderDate = assertCalendarDate(
    input.orderDate.trim(),
    "WORK_ORDER_DATE_INVALID",
  );
  const until = input.validUntil?.trim() ?? "";
  const validUntil =
    until === "" ? null : assertCalendarDate(until, "VALID_UNTIL_INVALID");
  if (validUntil != null && daysBetween(orderDate, validUntil) < 0)
    throw field(
      "VALID_UNTIL_BEFORE_ORDER_DATE",
      "Valid until is on or after the order date.",
      "validUntil",
    );
  const scope = input.scope?.trim() ?? "";
  if (scope.length > WORK_ORDER_SCOPE_MAX)
    throw field(
      "WORK_ORDER_SCOPE_TOO_LONG",
      `The scope is at most ${WORK_ORDER_SCOPE_MAX.toLocaleString("en-IN")} characters.`,
      "scope",
    );
  return { orderDate, validUntil, scope: scope === "" ? null : scope };
}

// ---------------------------------------------------------------------------
// Terms
// ---------------------------------------------------------------------------

export type WorkOrderTermsInput = {
  retentionPercent?: string | number | null;
  retentionCapPercent?: string | number | null;
  retentionCompletionPercent?: string | number | null;
  dlpMonths?: number | null;
  /** Left out: the Contractor's default; null: no TDS. */
  tdsNature?: string | null;
  sacCode?: string | null;
  gstRate?: string | number | null;
  reverseCharge?: boolean | null;
  /** Paise. */
  mobilisationAdvance?: number | bigint | null;
  mobilisationRecoveryPercent?: string | number | null;
};

export type WorkOrderTerms = {
  /** Hundredths of a percent of each bill. */
  retentionPercent: bigint;
  /** Hundredths of a percent of the Work Order's value; null = no cap. */
  retentionCapPercent: bigint | null;
  /** Hundredths of a percent released on completion; the rest at the DLP end. */
  retentionCompletionPercent: bigint;
  dlpMonths: number | null;
  tdsNature: TdsNature | null;
  sacCode: string | null;
  /** Hundredths of a percent. */
  gstRate: bigint | null;
  reverseCharge: boolean;
  /** Paise. */
  mobilisationAdvance: bigint | null;
  /** Hundredths of a percent of each bill. */
  mobilisationRecoveryPercent: bigint | null;
};

function percentTerm(
  raw: string | number | null | undefined,
  code: string,
  name: string,
  label: string,
): bigint | null {
  if (!given(raw)) return null;
  const value = percentOf(raw, PERCENT_MAX);
  if (value == null)
    throw field(
      code,
      `${label} is a percentage from 0 to 100, with at most two decimals.`,
      name,
    );
  return value;
}

export function isTdsNature(value: string): value is TdsNature {
  return (TDS_NATURES as readonly string[]).includes(value);
}

/** The TDS nature a new Work Order starts with (CM-0023 §14). */
export function defaultTdsNature(contractor: {
  tdsApplicable: boolean;
}): TdsNature | null {
  return contractor.tdsApplicable ? "contractor" : null;
}

/**
 * Checks the terms. `tdsNature` left out takes `defaultTds`. Retention is
 * 0 when blank and released 50 % on completion when blank.
 */
export function workOrderTerms(
  input: WorkOrderTermsInput,
  defaultTds: TdsNature | null,
): WorkOrderTerms {
  const retentionPercent =
    percentTerm(
      input.retentionPercent,
      "RETENTION_PERCENT_INVALID",
      "terms.retentionPercent",
      "Retention",
    ) ?? 0n;
  const retentionCapPercent = percentTerm(
    input.retentionCapPercent,
    "RETENTION_CAP_INVALID",
    "terms.retentionCapPercent",
    "The retention cap",
  );
  const retentionCompletionPercent =
    percentTerm(
      input.retentionCompletionPercent,
      "RETENTION_COMPLETION_INVALID",
      "terms.retentionCompletionPercent",
      "Retention released on completion",
    ) ?? RETENTION_COMPLETION_DEFAULT;
  const dlp = input.dlpMonths ?? null;
  if (
    dlp != null &&
    (!Number.isInteger(dlp) || dlp < 0 || dlp > DLP_MONTHS_MAX)
  )
    throw field(
      "DLP_MONTHS_INVALID",
      `The DLP is a whole number of months from 0 to ${String(DLP_MONTHS_MAX)}.`,
      "terms.dlpMonths",
    );
  let tdsNature: TdsNature | null;
  if (input.tdsNature === undefined) tdsNature = defaultTds;
  else {
    const raw = input.tdsNature?.trim() ?? "";
    if (raw === "") tdsNature = null;
    else if (isTdsNature(raw)) tdsNature = raw;
    else
      throw field(
        "TDS_NATURE_INVALID",
        "Pick one of the TDS natures.",
        "terms.tdsNature",
      );
  }
  const sac = oneLine(input.sacCode)?.replace(/\s/g, "") ?? null;
  if (sac != null && !isValidSacHsn(sac))
    throw field(
      "SAC_HSN_INVALID",
      "The SAC code is 4 to 8 digits.",
      "terms.sacCode",
    );
  let gstRate: bigint | null = null;
  if (given(input.gstRate)) {
    gstRate = percentOf(input.gstRate, WORK_ORDER_GST_RATE_MAX);
    if (gstRate == null)
      throw field(
        "GST_RATE_INVALID",
        "GST is a percentage from 0 to 28, with at most two decimals.",
        "terms.gstRate",
      );
  }
  let mobilisationAdvance: bigint | null = null;
  if (input.mobilisationAdvance != null) {
    mobilisationAdvance = paise(input.mobilisationAdvance);
    if (mobilisationAdvance == null)
      throw field(
        "MOBILISATION_ADVANCE_INVALID",
        "The mobilisation advance is an amount from ₹0 to ₹1,000 crore.",
        "terms.mobilisationAdvance",
      );
  }
  const mobilisationRecoveryPercent = percentTerm(
    input.mobilisationRecoveryPercent,
    "MOBILISATION_RECOVERY_INVALID",
    "terms.mobilisationRecoveryPercent",
    "The recovery",
  );
  return {
    retentionPercent,
    retentionCapPercent,
    retentionCompletionPercent,
    dlpMonths: dlp,
    tdsNature,
    sacCode: sac,
    gstRate,
    reverseCharge: input.reverseCharge === true,
    mobilisationAdvance,
    mobilisationRecoveryPercent,
  };
}

// ---------------------------------------------------------------------------
// Lines
// ---------------------------------------------------------------------------

/** A line as checked: what the application filled in from the BOQ already applied. */
export type WorkOrderLineInput = {
  kind: WorkOrderLineKind;
  boqItemId: string | null;
  itemNo?: string | null;
  description: string;
  uomId: string;
  sacHsn?: string | null;
  quantity: string | number | null | undefined;
  /** Paise per UoM. */
  rate: number | bigint;
};

export type WorkOrderLineFields = {
  kind: WorkOrderLineKind;
  boqItemId: string | null;
  itemNo: string | null;
  description: string;
  uomId: string;
  sacHsn: string | null;
  /** Ten-thousandths of the UoM. */
  quantity: bigint;
  /** Paise per UoM. */
  rate: bigint;
};

/** Checks one line; `index` (from 0) names it in `details.field`. */
export function workOrderLine(
  input: WorkOrderLineInput,
  index: number,
): WorkOrderLineFields {
  const boqItemId = input.kind === "boq" ? (input.boqItemId ?? "") : null;
  if (boqItemId === "")
    throw lineField(
      "WORK_ORDER_BOQ_ITEM_REQUIRED",
      "Pick the BOQ item.",
      index,
      "boqItemId",
    );
  const itemNo = oneLine(input.itemNo);
  if (itemNo != null && itemNo.length > BOQ_ITEM_NO_MAX)
    throw lineField(
      "BOQ_ITEM_NO_TOO_LONG",
      `The item number is at most ${String(BOQ_ITEM_NO_MAX)} characters.`,
      index,
      "itemNo",
    );
  const description = input.description.trim();
  if (description === "")
    throw lineField(
      "WORK_ORDER_LINE_DESCRIPTION_REQUIRED",
      "Enter the line's description.",
      index,
      "description",
    );
  if (description.length > BOQ_ITEM_DESCRIPTION_MAX)
    throw lineField(
      "BOQ_ITEM_DESCRIPTION_TOO_LONG",
      `The description is at most ${BOQ_ITEM_DESCRIPTION_MAX.toLocaleString("en-IN")} characters.`,
      index,
      "description",
    );
  const uomId = input.uomId.trim();
  if (uomId === "")
    throw lineField(
      "WORK_ORDER_LINE_UOM_REQUIRED",
      "Pick the line's UoM.",
      index,
      "uomId",
    );
  const sacHsn = oneLine(input.sacHsn)?.replace(/\s/g, "") ?? null;
  if (sacHsn != null && !isValidSacHsn(sacHsn))
    throw lineField(
      "SAC_HSN_INVALID",
      "The SAC or HSN code is 4 to 8 digits.",
      index,
      "sacHsn",
    );
  const quantity = boqQuantity(input.quantity);
  if (quantity == null)
    throw lineField(
      "BOQ_QUANTITY_INVALID",
      "The quantity is more than 0, with at most four decimals.",
      index,
      "quantity",
    );
  const rate = paise(input.rate);
  if (rate == null)
    throw lineField(
      "BOQ_RATE_INVALID",
      "The rate is an amount from ₹0 to ₹1,000 crore.",
      index,
      "rate",
    );
  if (boqAmount(quantity, rate) > BOQ_AMOUNT_MAX)
    throw lineField(
      "BOQ_AMOUNT_TOO_LARGE",
      "Quantity × rate is more than ₹1,000 crore. Split the line.",
      index,
      "quantity",
    );
  return {
    kind: input.kind,
    boqItemId,
    itemNo,
    description,
    uomId,
    sacHsn,
    quantity,
    rate,
  };
}

/** The lines of one Work Order: at least one, at most 500. */
export function assertLineCount(count: number): void {
  if (count === 0)
    throw field("WORK_ORDER_LINES_REQUIRED", "Add at least one line.", "lines");
  if (count > WORK_ORDER_LINES_MAX)
    throw field(
      "WORK_ORDER_TOO_MANY_LINES",
      `A Work Order has at most ${String(WORK_ORDER_LINES_MAX)} lines.`,
      "lines",
    );
}

/** Paise: `round(quantity × rate)`, half up. */
export function workOrderLineAmount(line: {
  quantity: bigint;
  rate: bigint;
}): bigint {
  return boqAmount(line.quantity, line.rate);
}

/** Paise: the sum of the rounded line amounts. */
export function workOrderValue(
  lines: readonly { quantity: bigint; rate: bigint }[],
): bigint {
  return lines.reduce((sum, line) => sum + workOrderLineAmount(line), 0n);
}

// ---------------------------------------------------------------------------
// Remaining BOQ quantity
// ---------------------------------------------------------------------------

/**
 * What a BOQ item has left to give out: its current quantity less what the
 * lines of other live, non-cancelled Work Orders already order. May be
 * negative when they order more.
 */
export function remainingQuantity(
  boqQuantity: bigint,
  orderedElsewhere: bigint,
): bigint {
  return boqQuantity - orderedElsewhere;
}

export type OverRemaining = {
  boqItemId: string;
  itemNo: string;
  /** Ten-thousandths: what this Work Order's lines order of the item. */
  ordered: bigint;
  /** Ten-thousandths: what the BOQ had left for it. */
  remaining: bigint;
};

/**
 * The BOQ items this Work Order orders more of than the BOQ has left (a
 * warning, never a refusal; CM-0023 §5). Lines naming the same item are
 * added up. In the order the items first appear.
 */
export function overRemaining(
  lines: readonly {
    kind: WorkOrderLineKind;
    boqItemId: string | null;
    quantity: bigint;
  }[],
  boqItems: ReadonlyMap<string, { itemNo: string; quantity: bigint }>,
  orderedElsewhere: ReadonlyMap<string, bigint>,
): OverRemaining[] {
  const ordered = new Map<string, bigint>();
  for (const line of lines)
    if (line.kind === "boq" && line.boqItemId != null)
      ordered.set(
        line.boqItemId,
        (ordered.get(line.boqItemId) ?? 0n) + line.quantity,
      );
  const over: OverRemaining[] = [];
  for (const [boqItemId, quantity] of ordered) {
    const item = boqItems.get(boqItemId);
    if (item == null) continue;
    const remaining = remainingQuantity(
      item.quantity,
      orderedElsewhere.get(boqItemId) ?? 0n,
    );
    if (quantity > remaining)
      over.push({
        boqItemId,
        itemNo: item.itemNo,
        ordered: quantity,
        remaining,
      });
  }
  return over;
}

/** The words a warning shows. */
export function overRemainingMessage(over: OverRemaining): string {
  const remaining =
    over.remaining <= 0n
      ? "nothing left"
      : `${trimmedQuantity(over.remaining)} left`;
  return `BOQ item ${over.itemNo}: ordering ${trimmedQuantity(over.ordered)}, the BOQ has ${remaining} after other Work Orders.`;
}

function trimmedQuantity(value: bigint): string {
  const text = quantityText(value);
  return text.replace(/\.?0+$/, "");
}

// ---------------------------------------------------------------------------
// Materials issued (CM-0023 §10)
// ---------------------------------------------------------------------------

export type WorkOrderMaterialInput = {
  materialId: string;
  issueBasis: IssueBasis;
  /** Paise per material UoM; at cost only. */
  issueRate?: number | bigint | null;
  wastagePercent?: string | number | null;
  /** Paise per material UoM charged on the excess. */
  penalRate?: number | bigint | null;
  /**
   * Material per unit of a line, by the line's index in `lines`. A line
   * left out takes the default from its BOQ item's rate analysis; a blank
   * coefficient means none.
   */
  coefficients?: readonly {
    line: number;
    coefficient: string | number | null;
  }[];
};

export type WorkOrderMaterialFields = {
  materialId: string;
  issueBasis: IssueBasis;
  issueRate: bigint | null;
  /** Hundredths of a percent. */
  wastagePercent: bigint;
  penalRate: bigint | null;
  /** Ten-thousandths by line index; null = sent blank (none). */
  coefficients: Map<number, bigint | null>;
};

/** A coefficient: more than 0 and at most 10,00,000 with four places; null when blank. */
export function coefficientOf(
  raw: string | number | null | undefined,
): bigint | null | undefined {
  if (!given(raw)) return null;
  const value = scaledDecimal(raw, COEFFICIENT_SCALE);
  if (value == null || value <= 0n || value > COEFFICIENT_MAX * 10_000n)
    return undefined;
  return value;
}

/** Checks one material row; `index` (from 0) names it, `lineCount` bounds its coefficients. */
export function workOrderMaterial(
  input: WorkOrderMaterialInput,
  index: number,
  lineCount: number,
): WorkOrderMaterialFields {
  const materialId = input.materialId.trim();
  if (materialId === "")
    throw materialField(
      "WORK_ORDER_MATERIAL_REQUIRED",
      "Pick the Material.",
      index,
      "materialId",
    );
  if (!(ISSUE_BASES as readonly string[]).includes(input.issueBasis))
    throw materialField(
      "ISSUE_BASIS_INVALID",
      "Pick free issue or at cost.",
      index,
      "issueBasis",
    );
  let issueRate: bigint | null = null;
  if (input.issueBasis === "at_cost") {
    issueRate = input.issueRate == null ? null : paise(input.issueRate);
    if (issueRate == null)
      throw materialField(
        "ISSUE_RATE_INVALID",
        "Material issued at cost needs its rate, from ₹0 to ₹1,000 crore.",
        index,
        "issueRate",
      );
  }
  let wastagePercent = 0n;
  if (given(input.wastagePercent)) {
    const value = percentOf(input.wastagePercent, PERCENT_MAX);
    if (value == null)
      throw materialField(
        "WASTAGE_PERCENT_INVALID",
        "Wastage is a percentage from 0 to 100, with at most two decimals.",
        index,
        "wastagePercent",
      );
    wastagePercent = value;
  }
  let penalRate: bigint | null = null;
  if (input.penalRate != null) {
    penalRate = paise(input.penalRate);
    if (penalRate == null)
      throw materialField(
        "PENAL_RATE_INVALID",
        "The penal rate is an amount from ₹0 to ₹1,000 crore.",
        index,
        "penalRate",
      );
  }
  const coefficients = new Map<number, bigint | null>();
  for (const entry of input.coefficients ?? []) {
    if (
      !Number.isInteger(entry.line) ||
      entry.line < 0 ||
      entry.line >= lineCount
    )
      throw materialField(
        "COEFFICIENT_LINE_INVALID",
        "A coefficient names a line that is not on the Work Order.",
        index,
        "coefficients",
      );
    const value = coefficientOf(entry.coefficient);
    if (value === undefined)
      throw materialField(
        "COEFFICIENT_INVALID",
        "A coefficient is more than 0 and at most 10,00,000, with at most four decimals.",
        index,
        `coefficients.${String(entry.line)}`,
      );
    coefficients.set(entry.line, value);
  }
  return {
    materialId,
    issueBasis: input.issueBasis,
    issueRate,
    wastagePercent,
    penalRate,
    coefficients,
  };
}

/** At most 100 materials, each once. */
export function assertMaterialsDistinct(
  materials: readonly { materialId: string }[],
): void {
  if (materials.length > WORK_ORDER_MATERIALS_MAX)
    throw field(
      "WORK_ORDER_TOO_MANY_MATERIALS",
      `A Work Order issues at most ${String(WORK_ORDER_MATERIALS_MAX)} Materials.`,
      "materials",
    );
  const seen = new Set<string>();
  materials.forEach((material, index) => {
    if (seen.has(material.materialId))
      throw materialField(
        "WORK_ORDER_MATERIAL_DUPLICATE",
        "This Material is already on the list.",
        index,
        "materialId",
      );
    seen.add(material.materialId);
  });
}

/**
 * A line's coefficient for a Material when the form left it out: the
 * Material's coefficient in the rate analysis of the library Item the
 * line's BOQ item was copied from (several analysis lines of the same
 * Material add up), or null.
 */
export function defaultCoefficient(
  analysis: ReadonlyMap<string, ReadonlyMap<string, bigint>>,
  libraryItemId: string | null,
  materialId: string,
): bigint | null {
  if (libraryItemId == null) return null;
  return analysis.get(libraryItemId)?.get(materialId) ?? null;
}

/**
 * Every line's coefficient for one material row: what the form sent, or
 * the rate analysis default for lines it left out. Lines without one are
 * not listed.
 */
export function resolvedCoefficients(
  material: WorkOrderMaterialFields,
  lineLibraryItems: readonly (string | null)[],
  analysis: ReadonlyMap<string, ReadonlyMap<string, bigint>>,
): Map<number, bigint> {
  const out = new Map<number, bigint>();
  lineLibraryItems.forEach((libraryItemId, line) => {
    const sent = material.coefficients.get(line);
    const value =
      sent === undefined && !material.coefficients.has(line)
        ? defaultCoefficient(analysis, libraryItemId, material.materialId)
        : (sent ?? null);
    if (value != null) out.set(line, value);
  });
  return out;
}

// ---------------------------------------------------------------------------
// Life
// ---------------------------------------------------------------------------

const ACTION_WORDS = {
  edit: "edited",
  delete: "deleted",
  submit: "submitted",
  amend: "amended",
  close: "closed",
  cancel: "cancelled",
} as const;

export type WorkOrderAction = keyof typeof ACTION_WORDS;

const ALLOWED: Record<WorkOrderAction, readonly WorkOrderStatus[]> = {
  edit: ["draft"],
  delete: ["draft"],
  submit: ["draft"],
  amend: ["issued"],
  close: ["issued"],
  cancel: ["draft", "issued"],
};

/**
 * Which status each action needs (409 `WORK_ORDER_STATUS_INVALID`, with
 * `details.status`): a draft is edited, deleted or submitted; an issued
 * one amended or closed; a draft or issued one cancelled. Approve and
 * Reject need pending approval (the approval kernel).
 */
export function assertWorkOrderAction(
  status: WorkOrderStatus,
  action: WorkOrderAction,
): void {
  if (ALLOWED[action].includes(status)) return;
  const label = status === "pending_approval" ? "pending approval" : status;
  throw conflict(
    "WORK_ORDER_STATUS_INVALID",
    `This Work Order is ${label}, so it cannot be ${ACTION_WORDS[action]}.`,
    { status, action },
  );
}

/** What a Work Order allows in its status (the flags are checked apart). */
export function workOrderActions(
  status: WorkOrderStatus,
): Record<WorkOrderAction | "approve" | "reject", boolean> {
  return {
    edit: ALLOWED.edit.includes(status),
    delete: ALLOWED.delete.includes(status),
    submit: ALLOWED.submit.includes(status),
    amend: ALLOWED.amend.includes(status),
    close: ALLOWED.close.includes(status),
    cancel: ALLOWED.cancel.includes(status),
    approve: status === "pending_approval",
    reject: status === "pending_approval",
  };
}

/** The reasons an amendment, a close or a cancel carries: required, ≤ 500. */
export function workOrderReason(raw: string | null | undefined, code: string) {
  return requiredText(raw, code, "reason");
}

/**
 * An amendment keeps every billed line (CM-0023 §5): a line an approved
 * bill names cannot be removed (409 `WORK_ORDER_LINE_BILLED`), and its
 * quantity cannot fall below what was billed (409
 * `WORK_ORDER_QUANTITY_BELOW_BILLED`, `details.lineId`, `details.billed`).
 */
export function assertBilledLinesKept(
  after: readonly { id: string; quantity: bigint }[],
  billed: ReadonlyMap<string, bigint>,
  itemNos: ReadonlyMap<string, string | null>,
): void {
  const kept = new Map(after.map((line) => [line.id, line.quantity]));
  for (const [lineId, quantity] of billed) {
    const name = itemNos.get(lineId);
    const label = name == null ? "A line" : `Line ${name}`;
    const now = kept.get(lineId);
    if (now === undefined)
      throw conflict(
        "WORK_ORDER_LINE_BILLED",
        `${label} is on an approved bill, so it cannot be removed.`,
        { lineId },
      );
    if (now < quantity)
      throw conflict(
        "WORK_ORDER_QUANTITY_BELOW_BILLED",
        `${label} has ${trimmedQuantity(quantity)} billed, so its quantity cannot go below that.`,
        { lineId, billed: quantityText(quantity) },
      );
  }
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export const workOrderNotFound = () =>
  notFound("WORK_ORDER_NOT_FOUND", "This Work Order was not found.");

/** Approve and Reject decide only a Work Order pending approval. */
export const workOrderNotPending = (status: WorkOrderStatus) =>
  conflict(
    "WORK_ORDER_NOT_PENDING",
    `This Work Order is ${status === "pending_approval" ? "pending approval" : status}, not pending approval.`,
    { status },
  );

export const workOrderChanged = () =>
  conflict(
    "WORK_ORDER_CHANGED",
    "Someone changed this Work Order after you opened it. Reload to see the latest.",
  );

export const workOrderContractorInvalid = () =>
  field(
    "WORK_ORDER_CONTRACTOR_INVALID",
    "Pick a Contractor assigned to this Project (Resources).",
    "contractorId",
  );

export const workOrderContractorFixed = () =>
  field(
    "WORK_ORDER_CONTRACTOR_FIXED",
    "An issued Work Order keeps its Contractor. Cancel it and raise a new one instead.",
    "contractorId",
  );

export const workOrderDepartmentInvalid = () =>
  field(
    "WORK_ORDER_DEPARTMENT_INVALID",
    "Pick one of the Contractor's Departments.",
    "departmentId",
  );

export const workOrderLineNotFound = (line: number) =>
  lineField(
    "WORK_ORDER_LINE_NOT_FOUND",
    "This line is no longer on the Work Order. Reload to see the latest.",
    line,
    "id",
  );

export const workOrderBoqItemInvalid = (line: number) =>
  lineField(
    "WORK_ORDER_BOQ_ITEM_INVALID",
    "Pick a BOQ item of this Project.",
    line,
    "boqItemId",
  );

export const workOrderLineUomInvalid = (line: number) =>
  lineField(
    "WORK_ORDER_LINE_UOM_INVALID",
    "Pick a UoM from Master records → Measurement Units.",
    line,
    "uomId",
  );

export const workOrderMaterialInvalid = (material: number) =>
  materialField(
    "WORK_ORDER_MATERIAL_INVALID",
    "Pick an enabled Material from Master records → Materials.",
    material,
    "materialId",
  );

/** A bill on the Work Order is still a draft or waiting for approval. */
export const workOrderBillOpen = (count: number) =>
  conflict(
    "WORK_ORDER_BILL_OPEN",
    count === 1
      ? "A bill on this Work Order is still a draft or waiting for approval. Approve, reject or delete it first."
      : `${String(count)} bills on this Work Order are still drafts or waiting for approval. Approve, reject or delete them first.`,
    { count },
  );

/** An approved bill names a line: the Work Order cannot be cancelled. */
export const workOrderBilled = () =>
  conflict(
    "WORK_ORDER_BILLED",
    "This Work Order has approved bills, so it cannot be cancelled. Close it instead.",
  );

export const closedOnBeforeOrderDate = () =>
  field(
    "CLOSED_ON_BEFORE_ORDER_DATE",
    "The close date is on or after the order date.",
    "closedOn",
  );
