import { z } from "zod";

import {
  isRupees,
  paiseToRupees,
  rupeesToPaise,
} from "@/components/money/money-input";
import type {
  AttendanceStatus,
  LabourSheet,
  LabourSheetRow,
  MarkLabourDayInput,
} from "@/src/queries/labour-attendance";

/** The status buttons, in tap order. */
export const STATUS_OPTIONS: {
  value: AttendanceStatus;
  label: string;
  short: string;
}[] = [
  { value: "present", label: "Present", short: "P" },
  { value: "half_day", label: "Half Day", short: "½" },
  { value: "absent", label: "Absent", short: "A" },
  { value: "on_leave", label: "Leave", short: "Leave" },
  { value: "holiday", label: "Holiday", short: "Holiday" },
];

export const STATUS_LABELS: Record<AttendanceStatus, string> = {
  present: "Present",
  half_day: "Half Day",
  absent: "Absent",
  on_leave: "On Leave",
  holiday: "Holiday",
};

/** The free shift label offered on the screen (`modules/08` decisions). */
export const SHIFT_OPTIONS = [
  "General",
  "Shift 1",
  "Shift 2",
  "Shift 3",
] as const;

export const NO_SHIFT = "none";

const HOURS_RE = /^\d{1,2}(\.\d{1,2})?$/;

const overtimeLineSchema = z.object({
  labourCategoryId: z.string(),
  hours: z
    .string()
    .trim()
    .refine(
      (value) =>
        HOURS_RE.test(value) && Number(value) > 0 && Number(value) <= 24,
      "Hours: more than 0, at most 24.",
    ),
  /** Rupees; empty means the labourer's overtime wage. */
  rate: z
    .string()
    .trim()
    .refine(
      (value) => value === "" || isRupees(value),
      "Enter a rate in rupees.",
    ),
});

const rowSchema = z
  .object({
    labourId: z.string(),
    status: z.enum([
      "",
      "present",
      "half_day",
      "absent",
      "on_leave",
      "holiday",
    ]),
    isPaidLeave: z.boolean(),
    shift: z.string(),
    overtime: z.array(overtimeLineSchema),
  })
  .refine((row) => row.status !== "absent" || row.overtime.length === 0, {
    message: "An Absent Labour cannot have overtime.",
    path: ["overtime"],
  });

export const labourSheetFormSchema = z.object({ rows: z.array(rowSchema) });

export type OvertimeLineDraft = z.infer<typeof overtimeLineSchema>;
export type LabourRowDraft = z.infer<typeof rowSchema>;
export type LabourSheetFormValues = z.infer<typeof labourSheetFormSchema>;

/** A row as the server has it (or unmarked), before any pre-fill. */
export function savedDraft(row: LabourSheetRow): LabourRowDraft {
  const day = row.attendance;
  if (day == null)
    return {
      labourId: row.labourId,
      status: "",
      isPaidLeave: false,
      shift: "",
      overtime: [],
    };
  return {
    labourId: row.labourId,
    status: day.status,
    isPaidLeave: day.isPaidLeave,
    shift: day.shift ?? "",
    overtime: day.overtime.map((line) => ({
      labourCategoryId: line.labourCategoryId ?? "",
      hours: line.hours,
      rate: line.ratePerHour == null ? "" : paiseToRupees(line.ratePerHour),
    })),
  };
}

/** The form's starting values: saved rows, and weekly holidays pre-filled Holiday. */
export function labourSheetDefaults(sheet: LabourSheet): LabourSheetFormValues {
  return {
    rows: sheet.labourers.map((row) => {
      const saved = savedDraft(row);
      if (row.attendance == null && row.canMark && row.isWeeklyHoliday)
        return { ...saved, status: "holiday" };
      return saved;
    }),
  };
}

function normalised(row: LabourRowDraft) {
  return {
    status: row.status,
    isPaidLeave: row.status === "on_leave" && row.isPaidLeave,
    shift: row.shift.trim(),
    overtime: row.overtime.map((line) => ({
      labourCategoryId: line.labourCategoryId,
      hours: line.hours.trim() === "" ? "" : String(Number(line.hours)),
      rate: line.rate.trim() === "" ? "" : String(rupeesToPaise(line.rate)),
    })),
  };
}

/** Whether the row differs from what the server has (a marked status is needed to save). */
export function isRowDirty(
  row: LabourSheetRow,
  draft: LabourRowDraft,
): boolean {
  if (!row.canMark || draft.status === "") return false;
  return (
    JSON.stringify(normalised(draft)) !==
    JSON.stringify(normalised(savedDraft(row)))
  );
}

/** A new overtime line: no category, empty hours, the labourer's OT wage. */
export function newOvertimeLine(row: LabourSheetRow): OvertimeLineDraft {
  return {
    labourCategoryId: row.labourCategory?.id ?? "",
    hours: "",
    rate:
      row.overtimeWagePerHour == null
        ? ""
        : paiseToRupees(row.overtimeWagePerHour),
  };
}

/**
 * The save body: only dirty rows, each with its loaded `updatedAt` in
 * `expected` when it was already marked (the review rule for multi-row saves).
 */
export function labourMarkPayload(
  projectId: string,
  date: string,
  sheet: LabourSheet,
  values: LabourSheetFormValues,
): MarkLabourDayInput | null {
  const marks: MarkLabourDayInput["marks"] = [];
  const expected: Record<string, string> = {};
  sheet.labourers.forEach((row, index) => {
    const draft = values.rows[index];
    if (draft == null || draft.status === "" || !isRowDirty(row, draft)) return;
    marks.push({
      labourId: row.labourId,
      status: draft.status,
      ...(draft.status === "on_leave"
        ? { isPaidLeave: draft.isPaidLeave }
        : {}),
      shift: draft.shift.trim() === "" ? null : draft.shift.trim(),
      overtime: draft.overtime.map((line) => ({
        labourCategoryId:
          line.labourCategoryId === "" ? null : line.labourCategoryId,
        hours: line.hours.trim(),
        ...(line.rate.trim() === ""
          ? {}
          : { ratePerHour: rupeesToPaise(line.rate) }),
      })),
    });
    if (row.attendance != null)
      expected[row.labourId] = row.attendance.updatedAt;
  });
  if (marks.length === 0) return null;
  return {
    projectId,
    date,
    marks,
    ...(Object.keys(expected).length > 0 ? { expected } : {}),
  };
}

/** Paise a draft day would earn, for the preview (null without wages). */
export function previewEarned(
  row: LabourSheetRow,
  draft: LabourRowDraft,
  date: string,
): number | null {
  if (draft.status === "") return null;
  const halves =
    draft.status === "present"
      ? 2
      : draft.status === "half_day"
        ? 1
        : draft.status === "on_leave"
          ? draft.isPaidLeave
            ? 2
            : 0
          : draft.status === "holiday"
            ? row.wageType === "monthly"
              ? 2
              : 0
            : 0;
  let day: number | null = null;
  if (row.wageType === "daily" && row.wagePerDay != null)
    day = Math.round((row.wagePerDay * halves) / 2);
  if (row.wageType === "monthly" && row.wagePerMonth != null) {
    const [year = 0, month = 0] = date.split("-").map(Number);
    const days = new Date(Date.UTC(year, month, 0)).getUTCDate();
    day = Math.round((row.wagePerMonth * halves) / (2 * days));
  }
  if (day == null) return null;
  let overtime = 0;
  for (const line of draft.overtime) {
    const hours = Number(line.hours);
    const rate =
      line.rate.trim() === ""
        ? row.overtimeWagePerHour
        : rupeesToPaise(line.rate);
    if (!Number.isFinite(hours) || rate == null) return null;
    overtime += Math.round(hours * rate);
  }
  return day + overtime;
}
