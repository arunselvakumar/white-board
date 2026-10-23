import {
  isCalendarDate,
  type CalendarDate,
} from "@/src/shared-kernel/calendar-date";
import { divideRounded } from "@/src/shared-kernel/decimal";
import {
  conflict,
  DomainError,
  notFound,
} from "@/src/shared-kernel/domain-error";

import { BOQ_QUANTITY_SCALE } from "./boq";
import {
  ESCALATION_COMPONENT_LABELS,
  ESCALATION_COMPONENTS,
  type EscalationComponent,
} from "./contract-terms";
import {
  fixedDecimal,
  PERCENT_SCALE,
  RATE_MAX,
  scaledDecimal,
} from "./item-analysis";

/**
 * Price indices, escalation clauses and the escalation bill's working
 * (CM-1109, ADR CM-0023 §9). An escalation bill applies the CPWD
 * clause 10CC formula to the value of work done in a period of whole
 * months:
 *
 *   amount = R × (1 − NE/100) × (weight/100) × (Ī − I₀) / I₀
 *
 * per component, where R is the gross of the side's approved running bills
 * dated in the period, NE the non-escalable %, I₀ the component's series in
 * the base month and Ī the average of the series over the period's months.
 * A cement or steel component may instead be worked out the clause 10CA way:
 *
 *   amount = quantity × base price × (Ī − I₀) / I₀
 *
 * and then its value at the base price is taken out of R before the 10CC
 * part, so it is not escalated twice. Every amount is rounded once, half
 * away from zero, to paise; the factor and Ī shown are rounded for display
 * only. Index values are ten-thousandths, percentages hundredths, money
 * paise and quantities ten-thousandths.
 */

export const INDEX_SCALE = 4;
/** `DECIMAL(12, 4)`: at most eight whole digits. */
export const INDEX_MAX = 10n ** 12n - 1n;
export const SERIES_MAX = 80;
/** The series the form suggests; any other name may be typed. */
export const PRICE_INDEX_SERIES_SUGGESTIONS = [
  "WPI – All commodities",
  "CPI-IW",
  "WPI – Cement",
  "WPI – Steel",
  "WPI – Bitumen",
  "WPI – HSD (POL)",
] as const;

export const ESCALATION_BASES = ["weighted", "quantity"] as const;
export type EscalationBasis = (typeof ESCALATION_BASES)[number];
export const ESCALATION_BASIS_LABELS: Record<EscalationBasis, string> = {
  weighted: "Weight of the value of work (10CC)",
  quantity: "Quantity × base price (10CA)",
};
/** Only these may be worked out on quantity (clause 10CA). */
export const QUANTITY_BASIS_COMPONENTS: readonly EscalationComponent[] = [
  "cement",
  "steel",
];
/** 15.00 %: CPWD's usual non-escalable share. */
export const NON_ESCALABLE_DEFAULT = 1500n;
export const ESCALATION_PERIOD_MONTHS_MAX = 12;
const HUNDREDTHS = 10_000n;
const QUANTITY_ONE = 10n ** BigInt(BOQ_QUANTITY_SCALE);
const QUANTITY_MAX = 10n ** 16n - 1n;
const FACTOR_SCALE = 6;

function field(code: string, message: string, name: string): DomainError {
  return new DomainError(code, message, { details: { field: name } });
}

// ---------------------------------------------------------------------------
// Months
// ---------------------------------------------------------------------------

const MONTH_NAMES = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

/** `"2026-04"` or `"2026-04-01"` → `"2026-04-01"`; null when it is neither. */
export function monthStart(
  raw: string | null | undefined,
): CalendarDate | null {
  const text = raw?.trim() ?? "";
  const match = /^(\d{4})-(\d{2})(?:-(\d{2}))?$/.exec(text);
  if (match == null) return null;
  const [, year, month, day] = match;
  if (day != null && day !== "01") return null;
  const date = `${year ?? ""}-${month ?? ""}-01`;
  return isCalendarDate(date) ? date : null;
}

/** The first day of the month `months` after `month`'s. */
export function addMonths(month: CalendarDate, months: number): CalendarDate {
  const year = Number(month.slice(0, 4));
  const index = Number(month.slice(5, 7)) - 1 + months;
  const y = year + Math.floor(index / 12);
  const m = ((index % 12) + 12) % 12;
  return `${String(y).padStart(4, "0")}-${String(m + 1).padStart(2, "0")}-01`;
}

/** The last day of the month a date is in. */
export function monthEnd(month: CalendarDate): CalendarDate {
  const next = addMonths(month.slice(0, 7) + "-01", 1);
  const time = Date.parse(`${next}T00:00:00Z`) - 86_400_000;
  return new Date(time).toISOString().slice(0, 10);
}

/** Every month from `from` to `to` (first days), both included. */
export function monthsFromTo(
  from: CalendarDate,
  to: CalendarDate,
): CalendarDate[] {
  const out: CalendarDate[] = [];
  for (
    let month = from.slice(0, 7) + "-01";
    month <= to;
    month = addMonths(month, 1)
  )
    out.push(month);
  return out;
}

/** `"2026-04-01"` → `"Apr 2026"`. */
export function monthLabel(month: CalendarDate): string {
  return `${MONTH_NAMES[Number(month.slice(5, 7)) - 1] ?? ""} ${month.slice(0, 4)}`;
}

/** `"Apr 2026 – Jun 2026"`, or one month's label. */
export function periodLabel(from: CalendarDate, to: CalendarDate): string {
  const a = monthLabel(from);
  const b = monthLabel(to);
  return a === b ? a : `${a} – ${b}`;
}

// ---------------------------------------------------------------------------
// Price indices
// ---------------------------------------------------------------------------

/** A series name: trimmed, inner spaces collapsed, 1–80 characters. */
export function seriesName(
  raw: string | null | undefined,
  name = "series",
): string {
  const text = (raw ?? "").trim().replace(/\s+/g, " ");
  if (text === "")
    throw field("PRICE_INDEX_SERIES_REQUIRED", "Name the index series.", name);
  if (text.length > SERIES_MAX)
    throw field(
      "PRICE_INDEX_SERIES_TOO_LONG",
      `A series name is at most ${String(SERIES_MAX)} characters.`,
      name,
    );
  return text;
}

/** The month an index is for (400 `PRICE_INDEX_MONTH_INVALID`). */
export function priceIndexMonth(
  raw: string | null | undefined,
  name = "month",
): CalendarDate {
  const month = monthStart(raw);
  if (month == null)
    throw field(
      "PRICE_INDEX_MONTH_INVALID",
      "Enter the month as YYYY-MM.",
      name,
    );
  return month;
}

/** An index value: more than 0 with at most four decimals, in ten-thousandths. */
export function priceIndexValue(
  raw: string | number | null | undefined,
  name = "value",
): bigint {
  const value =
    raw == null || (typeof raw === "string" && raw.trim() === "")
      ? null
      : scaledDecimal(raw, INDEX_SCALE);
  if (value == null || value <= 0n || value > INDEX_MAX)
    throw field(
      "PRICE_INDEX_VALUE_INVALID",
      "Enter an index of more than 0, with at most four decimals.",
      name,
    );
  return value;
}

export const indexText = (value: bigint): string =>
  fixedDecimal(value, INDEX_SCALE);

/** Series names match ignoring case, so a new index joins the series already kept. */
export function sameSeries(a: string, b: string): boolean {
  return a.toLocaleLowerCase("en-IN") === b.toLocaleLowerCase("en-IN");
}

export const priceIndexNotFound = () =>
  notFound("PRICE_INDEX_NOT_FOUND", "That price index was not found.");

export const priceIndexExists = (series: string, month: CalendarDate) =>
  conflict(
    "PRICE_INDEX_EXISTS",
    `${series} already has an index for ${monthLabel(month)}. Edit that one.`,
    { series, month },
  );

export const priceIndexChanged = () =>
  conflict(
    "PRICE_INDEX_CHANGED",
    "Someone changed this index after you opened it. Reload to see the latest.",
  );

// ---------------------------------------------------------------------------
// The clause
// ---------------------------------------------------------------------------

export type EscalationComponentInput = {
  component: string;
  basis?: string | null;
  weightPercent?: string | number | null;
  series: string;
  /** `quantity` basis: paise per unit at the base month. */
  basePrice?: number | bigint | null;
  /** `quantity` basis on a Work Order: the Material whose reconciled consumption fills the quantity (CM-1110). */
  materialId?: string | null;
};

export type EscalationClauseInput = {
  baseMonth: string;
  nonEscalablePercent?: string | number | null;
  components: readonly EscalationComponentInput[];
};

export type ClauseComponent = {
  component: EscalationComponent;
  basis: EscalationBasis;
  /** Hundredths of a percent; 0 on the quantity basis. */
  weightPercent: bigint;
  series: string;
  /** Paise per unit; null on the weighted basis. */
  basePrice: bigint | null;
  /** The Work Order Material filling a 10CA quantity (CM-1110); null otherwise. */
  materialId: string | null;
};

export type EscalationClauseTerms = {
  baseMonth: CalendarDate;
  /** Hundredths of a percent. */
  nonEscalablePercent: bigint;
  /** In `ESCALATION_COMPONENTS` order. */
  components: ClauseComponent[];
};

function componentField(
  code: string,
  message: string,
  index: number,
  name: string,
): DomainError {
  return new DomainError(code, message, {
    details: {
      component: index,
      field: `components.${String(index)}.${name}`,
    },
  });
}

function percentOf(raw: string | number | null | undefined): bigint | null {
  if (raw == null || (typeof raw === "string" && raw.trim() === ""))
    return null;
  return scaledDecimal(raw, PERCENT_SCALE);
}

/**
 * A clause as typed (ADR CM-0023 §9): a base month not after this month,
 * a non-escalable % from 0 to below 100 (blank 15), and one row per
 * component. A weighted component has a weight of more than 0 up to 100
 * and a series; a quantity one (cement or steel only) a base price and a
 * series. The weighted components' weights sum to exactly 100 (400
 * `ESCALATION_WEIGHTS_NOT_100`, `details.total`).
 */
export function escalationClause(
  input: EscalationClauseInput,
  context: { today: CalendarDate },
): EscalationClauseTerms {
  const baseMonth = monthStart(input.baseMonth);
  if (baseMonth == null)
    throw field(
      "ESCALATION_BASE_MONTH_INVALID",
      "Enter the base month as YYYY-MM.",
      "baseMonth",
    );
  if (baseMonth > context.today)
    throw field(
      "ESCALATION_BASE_MONTH_IN_FUTURE",
      "The base month cannot be after this month.",
      "baseMonth",
    );
  const typedNe = percentOf(input.nonEscalablePercent);
  const nonEscalablePercent =
    input.nonEscalablePercent == null ||
    (typeof input.nonEscalablePercent === "string" &&
      input.nonEscalablePercent.trim() === "")
      ? NON_ESCALABLE_DEFAULT
      : typedNe;
  if (
    nonEscalablePercent == null ||
    nonEscalablePercent < 0n ||
    nonEscalablePercent >= 100n * 100n
  )
    throw field(
      "ESCALATION_NON_ESCALABLE_INVALID",
      "The non-escalable share is a percentage from 0 to below 100, with at most two decimals.",
      "nonEscalablePercent",
    );
  if (input.components.length === 0)
    throw field(
      "ESCALATION_COMPONENTS_REQUIRED",
      "Add at least one component with its weight and index series.",
      "components",
    );
  if (input.components.length > ESCALATION_COMPONENTS.length)
    throw field(
      "ESCALATION_COMPONENT_DUPLICATE",
      "Each component appears once.",
      "components",
    );
  const seen = new Set<EscalationComponent>();
  const components = input.components.map((row, index): ClauseComponent => {
    const component = row.component as EscalationComponent;
    if (!(ESCALATION_COMPONENTS as readonly string[]).includes(row.component))
      throw componentField(
        "ESCALATION_COMPONENT_INVALID",
        "Pick labour, material, cement, steel, bitumen, POL or other.",
        index,
        "component",
      );
    if (seen.has(component))
      throw componentField(
        "ESCALATION_COMPONENT_DUPLICATE",
        `${ESCALATION_COMPONENT_LABELS[component]} appears twice.`,
        index,
        "component",
      );
    seen.add(component);
    const basisText = row.basis?.trim() ?? "";
    const basis = (
      basisText === "" ? "weighted" : basisText
    ) as EscalationBasis;
    if (!(ESCALATION_BASES as readonly string[]).includes(basis))
      throw componentField(
        "ESCALATION_BASIS_INVALID",
        "Work a component out by weight (10CC) or by quantity (10CA).",
        index,
        "basis",
      );
    if (basis === "quantity" && !QUANTITY_BASIS_COMPONENTS.includes(component))
      throw componentField(
        "ESCALATION_BASIS_INVALID",
        "Only cement and steel can be worked out on quantity (10CA).",
        index,
        "basis",
      );
    const series = seriesName(row.series, `components.${String(index)}.series`);
    if (basis === "quantity") {
      const raw = row.basePrice;
      const basePrice =
        raw == null
          ? null
          : typeof raw === "bigint"
            ? raw
            : Number.isSafeInteger(raw)
              ? BigInt(raw)
              : null;
      if (basePrice == null || basePrice <= 0n || basePrice > RATE_MAX)
        throw componentField(
          "ESCALATION_BASE_PRICE_INVALID",
          "Enter the base price per unit, more than ₹0.",
          index,
          "basePrice",
        );
      const material = row.materialId?.trim().toLowerCase() ?? "";
      return {
        component,
        basis,
        weightPercent: 0n,
        series,
        basePrice,
        materialId: material === "" ? null : material,
      };
    }
    const weight = percentOf(row.weightPercent);
    if (weight == null || weight <= 0n || weight > 100n * 100n)
      throw componentField(
        "ESCALATION_WEIGHT_INVALID",
        "A weight is more than 0 and at most 100, with at most two decimals.",
        index,
        "weightPercent",
      );
    return {
      component,
      basis,
      weightPercent: weight,
      series,
      basePrice: null,
      materialId: null,
    };
  });
  const total = components.reduce((sum, row) => sum + row.weightPercent, 0n);
  if (total !== 100n * 100n)
    throw new DomainError(
      "ESCALATION_WEIGHTS_NOT_100",
      `The weights add up to ${fixedDecimal(total, PERCENT_SCALE)} %; they must add up to 100 %.`,
      {
        details: {
          field: "components",
          total: fixedDecimal(total, PERCENT_SCALE),
        },
      },
    );
  const order = (component: EscalationComponent) =>
    ESCALATION_COMPONENTS.indexOf(component);
  return {
    baseMonth,
    nonEscalablePercent,
    components: components.sort(
      (a, b) => order(a.component) - order(b.component),
    ),
  };
}

export const escalationClauseNotFound = () =>
  notFound(
    "ESCALATION_CLAUSE_NOT_FOUND",
    "That escalation clause was not found.",
  );

export const escalationClauseExists = () =>
  conflict(
    "ESCALATION_CLAUSE_EXISTS",
    "This contract already has an escalation clause. Edit that one.",
  );

export const escalationClauseChanged = () =>
  conflict(
    "ESCALATION_CLAUSE_CHANGED",
    "Someone changed this escalation clause after you opened it. Reload to see the latest.",
  );

export const escalationClauseUsed = (count: number) =>
  conflict(
    "ESCALATION_CLAUSE_USED",
    "An approved escalation bill uses this clause, so it can no longer be changed or removed. Reverse the escalation bills first.",
    { count },
  );

export const escalationClauseRequired = () =>
  new DomainError(
    "ESCALATION_CLAUSE_REQUIRED",
    "This contract has no escalation clause. Add one first.",
    { details: { field: "workOrderId" } },
  );

// ---------------------------------------------------------------------------
// The period
// ---------------------------------------------------------------------------

export type EscalationPeriod = {
  /** The first day of the first month. */
  from: CalendarDate;
  /** The last day of the last month. */
  to: CalendarDate;
  /** The first day of each month. */
  months: CalendarDate[];
};

/**
 * Whole months only (indices are monthly): from the month after the base
 * month (400 `ESCALATION_PERIOD_BEFORE_BASE`), at most 12 months (400
 * `ESCALATION_PERIOD_TOO_LONG`), ending on or before the bill date (400
 * `ESCALATION_PERIOD_AFTER_BILL_DATE`).
 */
export function escalationPeriod(
  input: { fromMonth: string; toMonth: string },
  context: { baseMonth: CalendarDate; billDate: CalendarDate },
): EscalationPeriod {
  const from = monthStart(input.fromMonth);
  if (from == null)
    throw field(
      "ESCALATION_PERIOD_INVALID",
      "Enter the first month as YYYY-MM.",
      "fromMonth",
    );
  const last = monthStart(input.toMonth);
  if (last == null)
    throw field(
      "ESCALATION_PERIOD_INVALID",
      "Enter the last month as YYYY-MM.",
      "toMonth",
    );
  if (last < from)
    throw field(
      "ESCALATION_PERIOD_INVALID",
      "The last month cannot be before the first.",
      "toMonth",
    );
  const months = monthsFromTo(from, last);
  if (months.length > ESCALATION_PERIOD_MONTHS_MAX)
    throw field(
      "ESCALATION_PERIOD_TOO_LONG",
      `An escalation bill covers at most ${String(ESCALATION_PERIOD_MONTHS_MAX)} months.`,
      "toMonth",
    );
  if (from <= context.baseMonth)
    throw field(
      "ESCALATION_PERIOD_BEFORE_BASE",
      `The period starts after the base month (${monthLabel(context.baseMonth)}).`,
      "fromMonth",
    );
  const to = monthEnd(last);
  if (to > context.billDate)
    throw field(
      "ESCALATION_PERIOD_AFTER_BILL_DATE",
      "The period ends on or before the bill date.",
      "toMonth",
    );
  return { from, to, months };
}

/** Two periods overlap when each starts on or before the other ends. */
export function periodsOverlap(
  a: { from: CalendarDate; to: CalendarDate },
  b: { from: CalendarDate; to: CalendarDate },
): boolean {
  return a.from <= b.to && b.from <= a.to;
}

export const escalationPeriodOverlap = (other: {
  number: string | null;
  from: CalendarDate;
  to: CalendarDate;
}) =>
  conflict(
    "ESCALATION_PERIOD_OVERLAP",
    `Escalation bill ${other.number ?? "(draft)"} already covers ${periodLabel(other.from, other.to)}. Escalation periods on a contract cannot overlap.`,
    { number: other.number, periodFrom: other.from, periodTo: other.to },
  );

// ---------------------------------------------------------------------------
// The working
// ---------------------------------------------------------------------------

/** An approved running bill the escalation takes (its gross is R's share). */
export type EscalationTakenBill = {
  id: string;
  number: string | null;
  billDate: CalendarDate;
  gross: bigint;
};

export type ComponentWorking = {
  component: EscalationComponent;
  basis: EscalationBasis;
  /** Hundredths of a percent; null on the quantity basis. */
  weightPercent: bigint | null;
  series: string;
  /** I₀: the series in the base month, ten-thousandths. */
  baseIndex: bigint;
  /** The series in each month of the period. */
  indices: { month: CalendarDate; value: bigint }[];
  /** Ī for display: the average, rounded to four places. */
  averageIndex: bigint;
  /** (Ī − I₀) / I₀ for display, six places ("0.050000"). */
  factor: string;
  /** Quantity basis: ten-thousandths used in the period. */
  quantity: bigint | null;
  /** Quantity basis: paise per unit at the base month. */
  basePrice: bigint | null;
  /** Paise, rounded half away from zero. */
  amount: bigint;
};

export type EscalationWorking = {
  clauseId: string;
  /** R: Σ gross of the bills taken. */
  valueOfWork: bigint;
  bills: EscalationTakenBill[];
  /** Σ quantity × base price of the quantity (10CA) components. */
  quantityValue: bigint;
  /** R less the 10CA materials' value (never below 0): what 10CC applies to. */
  escalableValue: bigint;
  nonEscalablePercent: bigint;
  baseMonth: CalendarDate;
  months: CalendarDate[];
  components: ComponentWorking[];
  /** Σ component amounts; negative when the indices fell. */
  gross: bigint;
};

export const priceIndexMissing = (series: string, month: CalendarDate) =>
  new DomainError(
    "PRICE_INDEX_MISSING",
    `There is no ${series} index for ${monthLabel(month)}. Add it under Master records → Price indices.`,
    { details: { series, month } },
  );

/**
 * The 10CC / 10CA working of an escalation bill. `index` answers a series'
 * value in a month, or null: the base month is looked up first, then each
 * month of the period, and the first gap refuses the working (400
 * `PRICE_INDEX_MISSING`, `details.series`, `details.month`).
 */
export function escalationWorking(input: {
  clauseId: string;
  clause: EscalationClauseTerms;
  bills: readonly EscalationTakenBill[];
  months: readonly CalendarDate[];
  index: (series: string, month: CalendarDate) => bigint | null;
  /** Ten-thousandths per quantity-basis component; blank is 0. */
  quantities: ReadonlyMap<EscalationComponent, bigint>;
}): EscalationWorking {
  const { clause, months } = input;
  const n = BigInt(months.length);
  const valueOfWork = input.bills.reduce((sum, bill) => sum + bill.gross, 0n);
  const quantityValue = clause.components
    .filter((row) => row.basis === "quantity")
    .reduce(
      (sum, row) =>
        sum +
        divideRounded(
          (input.quantities.get(row.component) ?? 0n) * (row.basePrice ?? 0n),
          QUANTITY_ONE,
        ),
      0n,
    );
  const rest = valueOfWork - quantityValue;
  const escalableValue = rest > 0n ? rest : 0n;
  const components = clause.components.map((row): ComponentWorking => {
    const baseIndex = input.index(row.series, clause.baseMonth);
    if (baseIndex == null)
      throw priceIndexMissing(row.series, clause.baseMonth);
    const indices = months.map((month) => {
      const value = input.index(row.series, month);
      if (value == null) throw priceIndexMissing(row.series, month);
      return { month, value };
    });
    const sum = indices.reduce((total, item) => total + item.value, 0n);
    // (Ī − I₀) / I₀ = (Σ − n·I₀) / (n·I₀), kept exact.
    const numerator = sum - n * baseIndex;
    const denominator = n * baseIndex;
    const factor = fixedDecimal(
      divideRounded(numerator * 10n ** BigInt(FACTOR_SCALE), denominator),
      FACTOR_SCALE,
    );
    const quantity =
      row.basis === "quantity"
        ? (input.quantities.get(row.component) ?? 0n)
        : null;
    const amount =
      row.basis === "quantity"
        ? divideRounded(
            (quantity ?? 0n) * (row.basePrice ?? 0n) * numerator,
            QUANTITY_ONE * denominator,
          )
        : divideRounded(
            escalableValue *
              (HUNDREDTHS - clause.nonEscalablePercent) *
              row.weightPercent *
              numerator,
            HUNDREDTHS * HUNDREDTHS * denominator,
          );
    return {
      component: row.component,
      basis: row.basis,
      weightPercent: row.basis === "quantity" ? null : row.weightPercent,
      series: row.series,
      baseIndex,
      indices,
      averageIndex: divideRounded(sum, n),
      factor,
      quantity,
      basePrice: row.basis === "quantity" ? row.basePrice : null,
      amount,
    };
  });
  return {
    clauseId: input.clauseId,
    valueOfWork,
    bills: [...input.bills],
    quantityValue,
    escalableValue,
    nonEscalablePercent: clause.nonEscalablePercent,
    baseMonth: clause.baseMonth,
    months: [...months],
    components,
    gross: components.reduce((sum, row) => sum + row.amount, 0n),
  };
}

/**
 * What must not move between drafting and approval: the bills taken, the
 * indices and each amount. A bill whose stored working differs from the
 * working now is stale (409 `ESCALATION_WORKING_CHANGED`).
 */
export function workingSignature(working: EscalationWorking): string {
  return JSON.stringify([
    working.clauseId,
    working.bills.map((bill) => [bill.id, String(bill.gross)]),
    working.nonEscalablePercent.toString(),
    working.baseMonth,
    working.months,
    working.components.map((row) => [
      row.component,
      row.basis,
      String(row.weightPercent),
      row.series,
      String(row.baseIndex),
      row.indices.map((item) => String(item.value)),
      String(row.quantity),
      String(row.basePrice),
      String(row.amount),
    ]),
    String(working.gross),
  ]);
}

/** A quantity typed for a 10CA component: 0 or more, four places. */
export function escalationQuantity(
  raw: string | number,
  index: number,
): bigint {
  const value = scaledDecimal(raw, BOQ_QUANTITY_SCALE);
  if (value == null || value < 0n || value > QUANTITY_MAX)
    throw new DomainError(
      "ESCALATION_QUANTITY_INVALID",
      "Enter the quantity used in the period: 0 or more, with at most four decimals.",
      {
        details: {
          field: `quantities.${String(index)}.quantity`,
        },
      },
    );
  return value;
}

// ---------------------------------------------------------------------------
// Errors and words of the escalation bill
// ---------------------------------------------------------------------------

export const escalationNoBills = () =>
  new DomainError(
    "ESCALATION_NO_BILLS",
    "No approved running bill is dated in this period, so there is no value of work to escalate.",
    { details: { field: "fromMonth" } },
  );

export const escalationWorkingChanged = () =>
  conflict(
    "ESCALATION_WORKING_CHANGED",
    "The bills, indices or clause behind this escalation bill changed since it was worked out. Refresh the draft (or reject it and draft again).",
  );

export const escalationGrossZero = () =>
  conflict(
    "ESCALATION_GROSS_ZERO",
    "This escalation bill comes to ₹0, so there is nothing to approve.",
  );

export const escalationRecovered = (count: number) =>
  conflict(
    "ESCALATION_RECOVERED",
    "A running bill recovers this escalation bill. Reverse or remove that recovery first.",
    { count },
  );

export const billInEscalation = (number: string | null) =>
  conflict(
    "BILL_IN_ESCALATION",
    `Escalation bill ${number ?? "(draft)"} takes this bill's value. Reverse or delete that escalation bill first.`,
    { number },
  );

/** The deduction reason a negative escalation bill's recovery carries. */
export function escalationRecoveryReason(
  number: string | null,
  from: CalendarDate,
  to: CalendarDate,
): string {
  return `Escalation recovery on ${number ?? "an escalation bill"} (${periodLabel(from, to)})`;
}

/** The deduction kinds an escalation bill takes: no advance recoveries. */
export const ESCALATION_DEDUCTION_KINDS = ["retention", "other"] as const;
