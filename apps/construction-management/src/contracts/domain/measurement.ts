import {
  assertCalendarDate,
  daysBetween,
  type CalendarDate,
} from "@/src/shared-kernel/calendar-date";
import { divideRounded, pow10 } from "@/src/shared-kernel/decimal";
import {
  DomainError,
  conflict,
  notFound,
} from "@/src/shared-kernel/domain-error";

import { BOQ_QUANTITY_MAX, BOQ_QUANTITY_SCALE, quantityText } from "./boq";
import type { MeasurementStatus, Side } from "./contract-terms";
import { isDeviation, percentOver } from "./deviation";
import { scaledDecimal } from "./item-analysis";

/**
 * The Measurement Book (CM-1105, ADR CM-0023 §6). A **sheet** records one
 * date, one side and one party: the **client** side measures BOQ items,
 * the **contractor** side the lines of one issued Work Order. Each **row**
 * names an item of its side and either gives the quantity directly or
 * computes it:
 *
 *     quantity = nos × (the product of the filled dimensions)
 *
 * Length, breadth and depth/height may each be blank, and a blank nos is
 * 1, so `nos` alone counts pieces and `nos × L` runs a length. A
 * **deduction** (an opening, say) is a row with a **negative nos** (or a
 * negative direct quantity); dimensions are always more than 0. Every
 * number has at most four decimals and the row's quantity is rounded once,
 * half up (away from zero for deductions), to four decimals.
 *
 * Life: **draft** (free edit and delete) → submit → **submitted** → check
 * (the joint measurement) → **checked**. A submitted sheet can be returned
 * to draft, and a checked one reopened to submitted, each with a reason.
 * A row taken by a bill (`bill_id`) makes the sheet read-only.
 */

export const MEASUREMENT_NAMING = {
  code: "MEASUREMENT",
  label: "Measurement sheet",
} as const;

export const MEASUREMENT_TITLE_MAX = 120;
export const MEASUREMENT_REMARKS_MAX = 2000;
export const MEASUREMENT_ROWS_MAX = 500;
export const MEASUREMENT_ROW_DESCRIPTION_MAX = 500;
export const MEASUREMENT_PARTY_NAME_MAX = 120;
export const MEASUREMENT_PARTY_ROLE_MAX = 80;

const SCALE = BOQ_QUANTITY_SCALE;
const ONE = pow10(SCALE);

function field(code: string, message: string, name: string): DomainError {
  return new DomainError(code, message, { details: { field: name } });
}

function rowField(
  code: string,
  message: string,
  row: number,
  name: string,
): DomainError {
  return new DomainError(code, message, {
    details: { row, field: `rows.${String(row)}.${name}` },
  });
}

function given(
  raw: string | number | null | undefined,
): raw is string | number {
  return raw != null && !(typeof raw === "string" && raw.trim() === "");
}

function text(
  raw: string | null | undefined,
  max: number,
  code: string,
  name: string,
  label: string,
): string | null {
  const value = raw?.trim() ?? "";
  if (value.length > max)
    throw field(
      code,
      `${label} is at most ${max.toLocaleString("en-IN")} characters.`,
      name,
    );
  return value === "" ? null : value;
}

/** A dated entry is never in the future. */
function notFuture(
  date: CalendarDate,
  today: CalendarDate,
  code: string,
  message: string,
  name: string,
): void {
  if (daysBetween(today, date) > 0) throw field(code, message, name);
}

// ---------------------------------------------------------------------------
// Header
// ---------------------------------------------------------------------------

export type MeasurementHeaderInput = {
  measuredOn: string;
  title?: string | null;
  remarks?: string | null;
};

export type MeasurementHeader = {
  measuredOn: CalendarDate;
  title: string | null;
  /** Keeps its line breaks. */
  remarks: string | null;
};

/** The date measured (not in the future), an optional title and remarks. */
export function measurementHeader(
  input: MeasurementHeaderInput,
  today: CalendarDate,
): MeasurementHeader {
  const measuredOn = assertCalendarDate(
    input.measuredOn.trim(),
    "MEASURED_ON_INVALID",
  );
  notFuture(
    measuredOn,
    today,
    "MEASURED_ON_IN_FUTURE",
    "The measurement date cannot be in the future.",
    "measuredOn",
  );
  const title = text(
    input.title?.replace(/\s+/g, " "),
    MEASUREMENT_TITLE_MAX,
    "MEASUREMENT_TITLE_TOO_LONG",
    "title",
    "The title",
  );
  const remarks = text(
    input.remarks,
    MEASUREMENT_REMARKS_MAX,
    "MEASUREMENT_REMARKS_TOO_LONG",
    "remarks",
    "The remarks",
  );
  return { measuredOn, title, remarks };
}

// ---------------------------------------------------------------------------
// Rows and the quantity formula
// ---------------------------------------------------------------------------

/** The numbers of a row, each in ten-thousandths; null when blank. */
export type MeasurementFigures = {
  nos: bigint | null;
  length: bigint | null;
  breadth: bigint | null;
  depth: bigint | null;
};

/**
 * `nos × L × B × D` in ten-thousandths, over the filled dimensions only, a
 * blank nos counting 1, rounded once half up (away from zero). With no
 * dimension at all it is the nos.
 */
export function computedQuantity(figures: MeasurementFigures): bigint {
  const dimensions = [figures.length, figures.breadth, figures.depth].filter(
    (value): value is bigint => value != null,
  );
  let product = figures.nos ?? ONE;
  for (const dimension of dimensions) product *= dimension;
  return divideRounded(product, ONE ** BigInt(dimensions.length));
}

/**
 * A number of the row typed as text, or null when blank or not a number
 * with at most four decimals (the form's "as you type" reading).
 */
export function measurementNumber(
  raw: string | number | null | undefined,
): bigint | null {
  if (!given(raw)) return null;
  // "3." is on its way to "3.5": read it as 3 while typing.
  return scaledDecimal(
    typeof raw === "string" ? raw.trim().replace(/\.$/, "") : raw,
    SCALE,
  );
}

/**
 * The quantity the form shows while you type: null until it can be worked
 * out (a number not readable, a dimension not above 0, a nos of 0).
 */
export function previewQuantity(input: {
  direct: boolean;
  quantity?: string | null;
  nos?: string | null;
  length?: string | null;
  breadth?: string | null;
  depth?: string | null;
}): bigint | null {
  if (input.direct) return measurementNumber(input.quantity);
  const read = (raw: string | null | undefined) =>
    given(raw) ? measurementNumber(raw) : undefined;
  const nos = read(input.nos);
  const length = read(input.length);
  const breadth = read(input.breadth);
  const depth = read(input.depth);
  if (nos === null || length === null || breadth === null || depth === null)
    return null;
  if (nos === 0n) return null;
  for (const dimension of [length, breadth, depth])
    if (dimension != null && dimension <= 0n) return null;
  return computedQuantity({
    nos: nos ?? null,
    length: length ?? null,
    breadth: breadth ?? null,
    depth: depth ?? null,
  });
}

export type MeasurementRowInput = {
  /** A BOQ item (client side). */
  boqItemId?: string | null;
  /** A line of the sheet's Work Order (contractor side). */
  workOrderLineId?: string | null;
  description?: string | null;
  nos?: string | number | null;
  length?: string | number | null;
  breadth?: string | number | null;
  depth?: string | number | null;
  /** The quantity is typed (`quantity`) rather than worked out. */
  direct?: boolean;
  quantity?: string | number | null;
};

export type MeasurementRowFields = MeasurementFigures & {
  boqItemId: string | null;
  workOrderLineId: string | null;
  description: string | null;
  direct: boolean;
  /** Ten-thousandths; negative for a deduction. */
  quantity: bigint;
};

function figure(
  raw: string | number | null | undefined,
  row: number,
  name: "nos" | "length" | "breadth" | "depth",
): bigint | null {
  if (!given(raw)) return null;
  const value = scaledDecimal(raw, SCALE);
  const label = name === "depth" ? "Depth / height" : name;
  if (name === "nos") {
    if (
      value == null ||
      value === 0n ||
      value > BOQ_QUANTITY_MAX ||
      -value > BOQ_QUANTITY_MAX
    )
      throw rowField(
        "MEASUREMENT_NOS_INVALID",
        "Nos is a number other than 0, with at most four decimals (negative for a deduction).",
        row,
        name,
      );
    return value;
  }
  if (value == null || value <= 0n || value > BOQ_QUANTITY_MAX)
    throw rowField(
      "MEASUREMENT_DIMENSION_INVALID",
      `${label.charAt(0).toUpperCase()}${label.slice(1)} is more than 0, with at most four decimals. Use a negative nos for a deduction.`,
      row,
      name,
    );
  return value;
}

/**
 * Cleans one row (index `row` from 0 for error details): its item on the
 * sheet's side, the description, and the quantity — typed when `direct`,
 * otherwise worked out from the numbers. Whether the item belongs to the
 * Project or the Work Order is the handler's check.
 */
export function measurementRow(
  input: MeasurementRowInput,
  side: Side,
  row: number,
): MeasurementRowFields {
  const boqItemId = input.boqItemId?.trim() ?? "";
  const lineId = input.workOrderLineId?.trim() ?? "";
  if (side === "client") {
    if (lineId !== "") throw measurementItemInvalid(row, side);
    if (boqItemId === "")
      throw rowField(
        "MEASUREMENT_ITEM_REQUIRED",
        "Pick the BOQ item measured.",
        row,
        "boqItemId",
      );
  } else {
    if (boqItemId !== "") throw measurementItemInvalid(row, side);
    if (lineId === "")
      throw rowField(
        "MEASUREMENT_ITEM_REQUIRED",
        "Pick the Work Order line measured.",
        row,
        "workOrderLineId",
      );
  }
  const description = input.description?.trim() ?? "";
  if (description.length > MEASUREMENT_ROW_DESCRIPTION_MAX)
    throw rowField(
      "MEASUREMENT_ROW_DESCRIPTION_TOO_LONG",
      `The description is at most ${String(MEASUREMENT_ROW_DESCRIPTION_MAX)} characters.`,
      row,
      "description",
    );
  const direct = input.direct === true;
  let figures: MeasurementFigures = {
    nos: null,
    length: null,
    breadth: null,
    depth: null,
  };
  let quantity: bigint;
  if (direct) {
    const typed = given(input.quantity)
      ? scaledDecimal(input.quantity, SCALE)
      : null;
    if (typed == null || typed === 0n)
      throw rowField(
        "MEASUREMENT_QUANTITY_INVALID",
        "Enter the quantity: a number other than 0, with at most four decimals (negative for a deduction).",
        row,
        "quantity",
      );
    quantity = typed;
  } else {
    figures = {
      nos: figure(input.nos, row, "nos"),
      length: figure(input.length, row, "length"),
      breadth: figure(input.breadth, row, "breadth"),
      depth: figure(input.depth, row, "depth"),
    };
    quantity = computedQuantity(figures);
    if (quantity === 0n)
      throw rowField(
        "MEASUREMENT_QUANTITY_ZERO",
        "This row works out to 0 at four decimals. Check the numbers.",
        row,
        "quantity",
      );
  }
  if (quantity > BOQ_QUANTITY_MAX || -quantity > BOQ_QUANTITY_MAX)
    throw rowField(
      "MEASUREMENT_QUANTITY_TOO_LARGE",
      "This row's quantity is too large. Split it.",
      row,
      "quantity",
    );
  return {
    boqItemId: side === "client" ? boqItemId.toLowerCase() : null,
    workOrderLineId: side === "contractor" ? lineId.toLowerCase() : null,
    description: description === "" ? null : description,
    direct,
    ...figures,
    quantity,
  };
}

/** A sheet keeps at most 500 rows. */
export function assertRowCount(count: number): void {
  if (count > MEASUREMENT_ROWS_MAX)
    throw field(
      "MEASUREMENT_TOO_MANY_ROWS",
      `A sheet keeps at most ${String(MEASUREMENT_ROWS_MAX)} rows. Start another sheet.`,
      "rows",
    );
}

// ---------------------------------------------------------------------------
// Joint measurement and reasons
// ---------------------------------------------------------------------------

export type JointMeasurementInput = {
  partyName?: string | null;
  partyRole?: string | null;
  jointOn?: string | null;
};

export type JointMeasurement = {
  partyName: string;
  partyRole: string;
  jointOn: CalendarDate;
};

/**
 * What a check records besides our engineer (CM-0023 §6): the other
 * party's name and role, and the date of the joint measurement — on or
 * after the date measured and not in the future.
 */
export function jointMeasurement(
  input: JointMeasurementInput,
  measuredOn: CalendarDate,
  today: CalendarDate,
): JointMeasurement {
  const partyName = input.partyName?.trim().replace(/\s+/g, " ") ?? "";
  if (partyName === "")
    throw field(
      "PARTY_NAME_REQUIRED",
      "Enter the name of the other party at the joint measurement.",
      "partyName",
    );
  if (partyName.length > MEASUREMENT_PARTY_NAME_MAX)
    throw field(
      "PARTY_NAME_TOO_LONG",
      `The name is at most ${String(MEASUREMENT_PARTY_NAME_MAX)} characters.`,
      "partyName",
    );
  const partyRole = input.partyRole?.trim().replace(/\s+/g, " ") ?? "";
  if (partyRole === "")
    throw field(
      "PARTY_ROLE_REQUIRED",
      "Enter the other party's role (Client's engineer, Contractor's supervisor).",
      "partyRole",
    );
  if (partyRole.length > MEASUREMENT_PARTY_ROLE_MAX)
    throw field(
      "PARTY_ROLE_TOO_LONG",
      `The role is at most ${String(MEASUREMENT_PARTY_ROLE_MAX)} characters.`,
      "partyRole",
    );
  const raw = input.jointOn?.trim() ?? "";
  if (raw === "")
    throw field(
      "JOINT_ON_REQUIRED",
      "Enter the date of the joint measurement.",
      "jointOn",
    );
  const jointOn = assertCalendarDate(raw, "JOINT_ON_INVALID");
  notFuture(
    jointOn,
    today,
    "JOINT_ON_IN_FUTURE",
    "The joint measurement date cannot be in the future.",
    "jointOn",
  );
  if (daysBetween(measuredOn, jointOn) < 0)
    throw field(
      "JOINT_ON_BEFORE_MEASURED_ON",
      "The joint measurement is on or after the date measured.",
      "jointOn",
    );
  return { partyName, partyRole, jointOn };
}

// ---------------------------------------------------------------------------
// Life
// ---------------------------------------------------------------------------

const ACTION_WORDS = {
  edit: "edited",
  submit: "submitted",
  check: "checked",
  return: "returned",
  reopen: "reopened",
} as const;

export type MeasurementAction = keyof typeof ACTION_WORDS;

const ALLOWED: Record<MeasurementAction, readonly MeasurementStatus[]> = {
  edit: ["draft"],
  submit: ["draft"],
  check: ["submitted"],
  return: ["submitted"],
  reopen: ["checked"],
};

/**
 * Which status each step needs (409 `MEASUREMENT_STATUS_INVALID`, with
 * `details.status` and `details.action`): a draft is edited and submitted;
 * a submitted sheet checked or returned; a checked one reopened. A delete
 * is allowed in any status (the flags differ), unless billed.
 */
export function assertMeasurementAction(
  status: MeasurementStatus,
  action: MeasurementAction,
): void {
  if (ALLOWED[action].includes(status)) return;
  throw conflict(
    "MEASUREMENT_STATUS_INVALID",
    `This sheet is ${status}, so it cannot be ${ACTION_WORDS[action]}.`,
    { status, action },
  );
}

/** What a sheet allows in its status (the flags and bills are checked apart). */
export function measurementActions(
  status: MeasurementStatus,
  billed: boolean,
): Record<MeasurementAction | "delete", boolean> {
  return {
    edit: !billed && ALLOWED.edit.includes(status),
    submit: !billed && ALLOWED.submit.includes(status),
    check: !billed && ALLOWED.check.includes(status),
    return: !billed && ALLOWED.return.includes(status),
    reopen: !billed && ALLOWED.reopen.includes(status),
    delete: !billed,
  };
}

/** A row on a bill makes the sheet read-only (409 `MEASUREMENT_BILLED`). */
export function assertNotBilled(billedRows: number): void {
  if (billedRows > 0)
    throw conflict(
      "MEASUREMENT_BILLED",
      "A bill has taken rows of this sheet, so it cannot be changed. Reverse the bill first.",
      { count: billedRows },
    );
}

// ---------------------------------------------------------------------------
// Cumulative quantities, deviation and over-quantity
// ---------------------------------------------------------------------------

/**
 * One item of a sheet's side, measured to date. `planned` is the BOQ
 * item's current quantity (client) or the Work Order line's quantity
 * (contractor); `checked` the sum of rows on other live checked sheets;
 * `thisSheet` this sheet's rows; `total` the two together.
 */
export type MeasuredItem = {
  itemId: string;
  planned: bigint;
  checked: bigint;
  thisSheet: bigint;
  total: bigint;
  /** More than planned: a deviation (client) or over the Work Order (contractor). */
  over: boolean;
  /** Client side: beyond the Company's deviation limit (needs a Variation). */
  overLimit: boolean;
  /** Hundredths of a percent over planned; null when planned is 0. */
  percentOver: bigint | null;
};

/**
 * Per item of the sheet, in first-row order: what this sheet brings it to.
 * The client side also compares with the deviation limit (hundredths of a
 * percent); the contractor side has no limit (`null`).
 */
export function measuredItems(
  rows: readonly { itemId: string; quantity: bigint }[],
  planned: ReadonlyMap<string, bigint>,
  checked: ReadonlyMap<string, bigint>,
  limit: bigint | null,
): MeasuredItem[] {
  const own = new Map<string, bigint>();
  for (const row of rows)
    own.set(row.itemId, (own.get(row.itemId) ?? 0n) + row.quantity);
  return [...own].map(([itemId, thisSheet]) => {
    const plan = planned.get(itemId) ?? 0n;
    const before = checked.get(itemId) ?? 0n;
    const total = before + thisSheet;
    return {
      itemId,
      planned: plan,
      checked: before,
      thisSheet,
      total,
      over: total > plan,
      overLimit: limit != null && isDeviation(total, plan, limit),
      percentOver: total > plan ? percentOver(total, plan) : null,
    };
  });
}

/**
 * Which rows push their item over its planned quantity, by index: walking
 * the rows in order from what other checked sheets measured, a row adding
 * to the item (not a deduction) is marked when the running total after it
 * is above the planned quantity.
 */
export function rowsOver(
  rows: readonly { itemId: string; quantity: bigint }[],
  planned: ReadonlyMap<string, bigint>,
  checked: ReadonlyMap<string, bigint>,
): Set<number> {
  const running = new Map(checked);
  const marked = new Set<number>();
  rows.forEach((row, index) => {
    const after = (running.get(row.itemId) ?? 0n) + row.quantity;
    running.set(row.itemId, after);
    if (row.quantity > 0n && after > (planned.get(row.itemId) ?? 0n))
      marked.add(index);
  });
  return marked;
}

/** The contractor side's warning: billing refuses more than the Work Order holds. */
export function overWorkOrderMessage(
  itemNo: string | null,
  total: bigint,
  planned: bigint,
): string {
  const name = itemNo == null ? "This line" : `Line ${itemNo}`;
  return `${name} is measured at ${trimmed(total)} against ${trimmed(planned)} on the Work Order. A bill will refuse the extra (WORK_ORDER_QUANTITY_EXCEEDED): amend the Work Order first.`;
}

/** `"12.5000"` → `"12.5"`, for messages. */
export function trimmed(value: bigint): string {
  return quantityText(value).replace(/\.?0+$/, "");
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export const measurementNotFound = () =>
  notFound("MEASUREMENT_NOT_FOUND", "This measurement sheet was not found.");

export const measurementChanged = () =>
  conflict(
    "MEASUREMENT_CHANGED",
    "Someone changed this measurement sheet after you opened it. Reload to see the latest.",
  );

/** The row's item is not one of its side (a BOQ item on the contractor side, a line of another Work Order). */
export function measurementItemInvalid(row: number, side: Side): DomainError {
  return side === "client"
    ? rowField(
        "MEASUREMENT_ITEM_INVALID",
        "Pick a BOQ item of this Project. A client-side sheet measures BOQ items.",
        row,
        "boqItemId",
      )
    : rowField(
        "MEASUREMENT_ITEM_INVALID",
        "Pick a line of this sheet's Work Order. A contractor-side sheet measures Work Order lines.",
        row,
        "workOrderLineId",
      );
}

export const measurementWorkOrderRequired = () =>
  field(
    "MEASUREMENT_WORK_ORDER_REQUIRED",
    "Pick the Work Order measured. A contractor-side sheet measures one issued Work Order.",
    "workOrderId",
  );

export const measurementWorkOrderNotAllowed = () =>
  field(
    "MEASUREMENT_WORK_ORDER_NOT_ALLOWED",
    "A client-side sheet measures the BOQ, not a Work Order.",
    "workOrderId",
  );

export const measurementWorkOrderInvalid = () =>
  field(
    "MEASUREMENT_WORK_ORDER_INVALID",
    "Pick an issued Work Order of this Project. Only issued Work Orders are measured.",
    "workOrderId",
  );

export const measurementRowsRequired = () =>
  field(
    "MEASUREMENT_ROWS_REQUIRED",
    "Add at least one row before submitting the sheet.",
    "rows",
  );
