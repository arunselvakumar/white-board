import {
  daysBetween,
  type CalendarDate,
} from "@/src/shared-kernel/calendar-date";
import {
  divideRounded,
  parseDecimal,
  pow10,
} from "@/src/shared-kernel/decimal";
import { DomainError } from "@/src/shared-kernel/domain-error";

/**
 * Task progress arithmetic (ADR CM-0019 §3, §4): status, progress from
 * quantity increments or percentages, the roll-up of summary tasks and of
 * the Project, earned value, baseline duration and variance. Pure and
 * exact: percentages are **hundredths of a percent** (`10000` = 100 %, as
 * `decimal(5,2)` holds them), quantities are **thousandths** of the task's
 * unit (`decimal(14,3)`), money is **paise**.
 */

/** 100 % in hundredths of a percent. */
export const FULL_PCT = 10_000;

/** Derived on read, never stored (CM-0019 §3). */
export const TASK_STATUSES = [
  "not_started",
  "in_progress",
  "delayed",
  "completed",
] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  not_started: "Not Started",
  in_progress: "In Progress",
  delayed: "Delayed",
  completed: "Completed",
};

export function isTaskStatus(value: string): value is TaskStatus {
  return (TASK_STATUSES as readonly string[]).includes(value);
}

/**
 * The status rule (CM-0019 §3): Completed at 100 %; otherwise Delayed when
 * the Company's today is after the Due Date; otherwise In Progress when
 * progress is above 0; otherwise Not Started. For a summary task pass its
 * rolled-up progress and Due Date (the latest of its leaf tasks').
 * `taskStatusSql` is its SQL twin; keep them in step.
 */
export function taskStatus(
  task: { progressPct: number; dueDate: CalendarDate | null },
  today: CalendarDate,
): TaskStatus {
  if (task.progressPct >= FULL_PCT) return "completed";
  if (task.dueDate != null && today > task.dueDate) return "delayed";
  if (task.progressPct > 0) return "in_progress";
  return "not_started";
}

// ---------------------------------------------------------------------------
// Numbers in and out
// ---------------------------------------------------------------------------

/** A percentage (0–100, two decimals at most) as hundredths. */
export function parsePercent(
  raw: string | number,
  field = "progressPct",
): number {
  let parsed: { numerator: bigint; scale: number };
  try {
    parsed = parseDecimal(raw);
  } catch {
    throw percentInvalid(field);
  }
  if (parsed.scale > 2 || parsed.numerator < 0n) throw percentInvalid(field);
  const hundredths = parsed.numerator * pow10(2 - parsed.scale);
  if (hundredths > BigInt(FULL_PCT)) throw percentInvalid(field);
  return Number(hundredths);
}

function percentInvalid(field: string): DomainError {
  return new DomainError(
    "PROGRESS_PERCENT_INVALID",
    "Enter a percentage from 0 to 100, with at most two decimals.",
    { details: { field } },
  );
}

/** Hundredths as a number of percent (`1250` → 12.5). */
export function percentValue(hundredths: number): number {
  return hundredths / 100;
}

/** Hundredths as `decimal(5,2)` text (`1250` → "12.50"). */
export function percentText(hundredths: number): string {
  return (hundredths / 100).toFixed(2);
}

/** A stored `decimal(5,2)` (Prisma Decimal or text) as hundredths. */
export function percentFromDb(value: { toString(): string }): number {
  const { numerator, scale } = parseDecimal(value.toString());
  return Number(divideRounded(numerator * 100n, pow10(scale)));
}

/** Most digits before the point in `decimal(14,3)`. */
const QUANTITY_WHOLE_DIGITS = 11;

/**
 * A quantity above 0, three decimals at most, as thousandths. `code` is
 * the refusal's error code; `field` goes in its details.
 */
export function parseQuantity(
  raw: string | number,
  field: string,
  code = "QUANTITY_INVALID",
): bigint {
  const fail = () =>
    new DomainError(
      code,
      "Enter a quantity above 0, with at most three decimals.",
      { details: { field } },
    );
  let parsed: { numerator: bigint; scale: number };
  try {
    parsed = parseDecimal(raw);
  } catch {
    throw fail();
  }
  if (parsed.scale > 3 || parsed.numerator <= 0n) throw fail();
  const milli = parsed.numerator * pow10(3 - parsed.scale);
  if (milli >= pow10(QUANTITY_WHOLE_DIGITS + 3)) throw fail();
  return milli;
}

/** A stored `decimal(14,3)` as thousandths. */
export function quantityFromDb(value: { toString(): string }): bigint {
  const { numerator, scale } = parseDecimal(value.toString());
  return scale <= 3
    ? numerator * pow10(3 - scale)
    : divideRounded(numerator, pow10(scale - 3));
}

/** Thousandths as plain decimal text without trailing zeros (`12500` → "12.5"). */
export function quantityText(milli: bigint): string {
  const negative = milli < 0n;
  const abs = negative ? -milli : milli;
  const whole = abs / 1000n;
  const fraction = (abs % 1000n).toString().padStart(3, "0").replace(/0+$/, "");
  return `${negative ? "-" : ""}${whole.toString()}${fraction === "" ? "" : `.${fraction}`}`;
}

// ---------------------------------------------------------------------------
// A leaf task's progress (CM-0019 §4)
// ---------------------------------------------------------------------------

/**
 * How a leaf task takes progress: a task with a work quantity takes
 * **work done in this update**; one without takes the **new percentage**.
 */
export type TaskKind = "quantity" | "percent";

export function taskKind(totalWorkQty: bigint | null): TaskKind {
  return totalWorkQty == null ? "percent" : "quantity";
}

/** Progress of a quantity task: Completed ÷ Total, capped at 100 %. */
export function quantityPct(
  completedMilli: bigint,
  totalMilli: bigint,
): number {
  if (totalMilli <= 0n) return 0;
  if (completedMilli >= totalMilli) return FULL_PCT;
  if (completedMilli <= 0n) return 0;
  // Below the total never rounds up to 100 %.
  return Math.min(
    FULL_PCT - 1,
    Number(divideRounded(completedMilli * BigInt(FULL_PCT), totalMilli)),
  );
}

/** One live progress update as the roll-up reads it. */
export type ProgressEntry = {
  progressDate: CalendarDate;
  createdAt: Date;
  /** Quantity tasks: work done in this update, thousandths. */
  workMilli: bigint | null;
  /** Percent tasks: the new percentage, hundredths. */
  pct: number | null;
};

export type LeafProgress = {
  /** Σ work of the updates (quantity tasks); 0 for percent tasks. */
  completedMilli: bigint;
  pct: number;
  /** The date of the first update. */
  actualStart: CalendarDate | null;
  /** The date the task last reached 100 %; null below 100 %. */
  actualEnd: CalendarDate | null;
};

/** Updates in the order they happened: by date, then by when they were entered. */
export function progressOrder(a: ProgressEntry, b: ProgressEntry): number {
  if (a.progressDate !== b.progressDate)
    return a.progressDate < b.progressDate ? -1 : 1;
  return a.createdAt.getTime() - b.createdAt.getTime();
}

/**
 * A leaf task's cached figures from its live updates (CM-0019 §3, §4).
 * Quantity tasks sum `workMilli` (updates without one are ignored);
 * percent tasks take the latest `pct`. Actual Start is the first update's
 * date; Actual End is the date of the update from which the task has
 * stayed at 100 %, so reopening (falling below 100 %) clears it.
 */
export function leafProgress(
  task: { totalWorkMilli: bigint | null },
  entries: readonly ProgressEntry[],
): LeafProgress {
  const sorted = [...entries].sort(progressOrder);
  const kind = taskKind(task.totalWorkMilli);
  let completedMilli = 0n;
  let pct = 0;
  let actualEnd: CalendarDate | null = null;
  for (const entry of sorted) {
    if (kind === "quantity") {
      if (entry.workMilli == null) continue;
      completedMilli += entry.workMilli;
      pct = quantityPct(completedMilli, task.totalWorkMilli ?? 0n);
    } else {
      if (entry.pct == null) continue;
      pct = entry.pct;
    }
    if (pct >= FULL_PCT) actualEnd ??= entry.progressDate;
    else actualEnd = null;
  }
  return {
    completedMilli,
    pct,
    actualStart: sorted[0]?.progressDate ?? null,
    actualEnd: pct >= FULL_PCT ? actualEnd : null,
  };
}

/**
 * **Mark As Completed** (CM-0019 §4): the update that brings a leaf task to
 * 100 % — the remaining quantity, or 100 %. 409 `TASK_ALREADY_COMPLETED`
 * when it is there already.
 */
export function completionEntry(
  task: { totalWorkMilli: bigint | null },
  current: { completedMilli: bigint; pct: number },
): { workMilli: bigint | null; pct: number | null } {
  if (current.pct >= FULL_PCT)
    throw new DomainError(
      "TASK_ALREADY_COMPLETED",
      "This task is already completed.",
      { kind: "conflict" },
    );
  if (task.totalWorkMilli == null) return { workMilli: null, pct: FULL_PCT };
  return {
    workMilli: task.totalWorkMilli - current.completedMilli,
    pct: null,
  };
}

// ---------------------------------------------------------------------------
// Earned value and roll-ups
// ---------------------------------------------------------------------------

/** Completed Price = Total Price × progress %, rounded half up to the paisa. */
export function earnedValue(
  totalPrice: bigint | null,
  pct: number,
): bigint | null {
  if (totalPrice == null) return null;
  return divideRounded(totalPrice * BigInt(pct), BigInt(FULL_PCT));
}

/** Planned days, both ends counted; null without both dates. */
export function plannedDays(
  start: CalendarDate | null,
  due: CalendarDate | null,
): number | null {
  if (start == null || due == null) return null;
  return daysBetween(start, due) + 1;
}

/** A leaf task as a roll-up reads it. */
export type RollupLeaf = {
  pct: number;
  totalPrice: bigint | null;
  startDate: CalendarDate | null;
  dueDate: CalendarDate | null;
};

export type ProgressWeighting = "price" | "duration";

/**
 * Which weight the roll-up uses (CM-0019 §4): Total Price when every leaf
 * has one (and they add up to more than 0), otherwise planned duration.
 */
export function rollupWeighting(
  leaves: readonly RollupLeaf[],
): ProgressWeighting | null {
  if (leaves.length === 0) return null;
  const priced = leaves.every((leaf) => leaf.totalPrice != null);
  const sum = leaves.reduce(
    (total, leaf) => total + (leaf.totalPrice ?? 0n),
    0n,
  );
  return priced && sum > 0n ? "price" : "duration";
}

/** A leaf's weight: its price, or its planned days (1 without both dates). */
function weight(leaf: RollupLeaf, weighting: ProgressWeighting): bigint {
  if (weighting === "price") return leaf.totalPrice ?? 0n;
  return BigInt(plannedDays(leaf.startDate, leaf.dueDate) ?? 1);
}

/**
 * Σ (weight × progress) ÷ Σ weight over the leaves, in hundredths, rounded
 * half up; below 100 % unless every leaf that weighs is there. Null with
 * no leaves.
 */
export function rollUp(leaves: readonly RollupLeaf[]): {
  pct: number | null;
  weighting: ProgressWeighting | null;
} {
  const weighting = rollupWeighting(leaves);
  if (weighting == null) return { pct: null, weighting: null };
  let weighted = 0n;
  let total = 0n;
  let allDone = true;
  for (const leaf of leaves) {
    const w = weight(leaf, weighting);
    weighted += w * BigInt(leaf.pct);
    total += w;
    if (w > 0n && leaf.pct < FULL_PCT) allDone = false;
  }
  if (total === 0n) return { pct: 0, weighting };
  const pct = Number(divideRounded(weighted, total));
  return { pct: allDone ? pct : Math.min(pct, FULL_PCT - 1), weighting };
}

/**
 * **Project Progress %** (CM-0019 §4) over the Project's live leaf tasks:
 * a percentage with two decimals and the weighting it used; `pct` and
 * `weighting` are null for a Project with no tasks. The dashboard and the
 * Project card use it.
 */
export function projectProgress(leaves: readonly RollupLeaf[]): {
  pct: number | null;
  weighting: ProgressWeighting | null;
} {
  const { pct, weighting } = rollUp(leaves);
  return { pct: pct == null ? null : percentValue(pct), weighting };
}

/** The earliest and latest of some dates (nulls ignored). */
export function dateSpan(
  starts: readonly (CalendarDate | null)[],
  ends: readonly (CalendarDate | null)[],
): { start: CalendarDate | null; end: CalendarDate | null } {
  let start: CalendarDate | null = null;
  let end: CalendarDate | null = null;
  for (const date of starts)
    if (date != null && (start == null || date < start)) start = date;
  for (const date of ends)
    if (date != null && (end == null || date > end)) end = date;
  return { start, end };
}

// ---------------------------------------------------------------------------
// Baseline (CM-0019 §3)
// ---------------------------------------------------------------------------

/** Baseline Duration = end − start + 1 calendar days. */
export function baselineDuration(
  start: CalendarDate | null,
  end: CalendarDate | null,
): number | null {
  return plannedDays(start, end);
}

/**
 * Variance in days, positive is late: (Actual End, or while open the
 * forecast end = the later of today and the Due Date) − Baseline End.
 * Null without a baseline.
 */
export function baselineVariance(
  task: {
    baselineEnd: CalendarDate | null;
    actualEnd: CalendarDate | null;
    dueDate: CalendarDate | null;
  },
  today: CalendarDate,
): number | null {
  if (task.baselineEnd == null) return null;
  const end =
    task.actualEnd ??
    (task.dueDate != null && task.dueDate > today ? task.dueDate : today);
  return daysBetween(task.baselineEnd, end);
}
