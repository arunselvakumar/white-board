import type {
  PersonAttendanceDay,
  PersonAttendancePage,
  PersonAttendancePlace,
} from "@/src/queries/person-attendance";

/**
 * What the Attendance tab (ADR CM-0051) works out in the browser: a
 * month's figures, a day's shade and the words for statuses and hours.
 */

export type DayStatus = PersonAttendanceDay["status"];
export type Measure = PersonAttendancePage["measure"];

/** As on the attendance sheet and HRMS. */
export const STATUS_LABELS: Record<DayStatus, string> = {
  present: "Present",
  half_day: "Half Day",
  paid_leave: "Paid Leave",
  on_leave: "On Leave",
  holiday: "Holiday",
  week_off: "Week Off",
  absent: "Absent",
};

export function workedShare(status: DayStatus): number {
  if (status === "present") return 1;
  if (status === "half_day") return 0.5;
  return 0;
}

/** A day that counts as worked, or one with hours or heads anyway (a holiday worked). */
export function isWorked(day: PersonAttendanceDay): boolean {
  return (
    workedShare(day.status) > 0 ||
    day.workedMinutes > 0 ||
    (day.headDays ?? 0) > 0
  );
}

/** "8 h", "7 h 30 m", "45 m", "0 h". */
export function formatMinutes(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0 && rest > 0) return `${String(rest)} m`;
  if (rest === 0) return `${String(hours)} h`;
  return `${String(hours)} h ${String(rest)} m`;
}

/** Hours to one decimal for a card: "176", "7.5". */
export function hoursFigure(minutes: number): string {
  const hours = Math.round((minutes / 60) * 10) / 10;
  return hours.toLocaleString("en-IN", { maximumFractionDigits: 1 });
}

/** "13.5", "12": head-days and halves of days. */
export function countFigure(value: number): string {
  return value.toLocaleString("en-IN", { maximumFractionDigits: 1 });
}

export type MonthFigures = {
  /** A Half Day counts as half; a Vendor's days supplied. */
  daysWorked: number;
  fullDays: number;
  halfDays: number;
  workedMinutes: number;
  overtimeMinutes: number;
  /** Average over the days worked; null with none. */
  averageMinutes: number | null;
  absent: number;
  leave: number;
  paidLeave: number;
  headDays: number;
  /** Most heads (full + half) on one day. */
  peakHeads: number;
  /** Places worked at, by name, most days first. */
  places: { id: string; name: string; days: number }[];
};

function heads(place: PersonAttendancePlace): number {
  return place.heads == null ? 0 : place.heads.full + place.heads.half;
}

/** A month's cards (ADR CM-0051 §4), from its days. */
export function monthFigures(
  days: readonly PersonAttendanceDay[],
): MonthFigures {
  const places = new Map<string, { id: string; name: string; days: number }>();
  const figures: MonthFigures = {
    daysWorked: 0,
    fullDays: 0,
    halfDays: 0,
    workedMinutes: 0,
    overtimeMinutes: 0,
    averageMinutes: null,
    absent: 0,
    leave: 0,
    paidLeave: 0,
    headDays: 0,
    peakHeads: 0,
    places: [],
  };
  for (const day of days) {
    figures.workedMinutes += day.workedMinutes;
    figures.overtimeMinutes += day.overtimeMinutes;
    figures.headDays += day.headDays ?? 0;
    figures.peakHeads = Math.max(
      figures.peakHeads,
      day.places.reduce((sum, place) => sum + heads(place), 0),
    );
    if (day.status === "present") figures.fullDays += 1;
    if (day.status === "half_day") figures.halfDays += 1;
    if (day.status === "absent") figures.absent += 1;
    if (day.status === "on_leave") figures.leave += 1;
    if (day.status === "paid_leave") figures.paidLeave += 1;
    if (!isWorked(day)) continue;
    figures.daysWorked += workedShare(day.status);
    for (const place of day.places) {
      if (
        place.workedMinutes === 0 &&
        place.heads == null &&
        !place.open &&
        !place.pending &&
        workedShare(place.status ?? "present") === 0
      )
        continue;
      const seen = places.get(place.place.id) ?? {
        id: place.place.id,
        name: place.place.name,
        days: 0,
      };
      seen.days += 1;
      places.set(place.place.id, seen);
    }
  }
  const worked = days.filter(isWorked).length;
  figures.averageMinutes =
    worked === 0 ? null : Math.round(figures.workedMinutes / worked);
  figures.places = [...places.values()].sort(
    (a, b) => b.days - a.days || a.name.localeCompare(b.name),
  );
  return figures;
}

/** Shade 0 (nothing) to 4 (most). */
export type Level = 0 | 1 | 2 | 3 | 4;

/**
 * A day's shade (ADR CM-0051 §2): hours in steps of under 4, under 8,
 * under 10 and 10 or more; a Vendor's head-days in quarters of the most
 * in the months shown.
 */
export function dayLevel(
  day: PersonAttendanceDay | undefined,
  measure: Measure,
  maxHeadDays: number,
): Level {
  if (day == null) return 0;
  if (measure === "head_days") {
    const value = day.headDays ?? 0;
    if (value <= 0 || maxHeadDays <= 0) return 0;
    return Math.min(
      4,
      Math.max(1, Math.ceil((value / maxHeadDays) * 4)),
    ) as Level;
  }
  const hours = day.workedMinutes / 60;
  if (hours <= 0)
    return workedShare(day.status) > 0 ||
      day.places.some((p) => p.open || p.pending)
      ? 1
      : 0;
  if (hours < 4) return 1;
  if (hours < 8) return 2;
  if (hours < 10) return 3;
  return 4;
}

/** The mark a day without work gets: absent, leave, or a day off. */
export function dayMark(
  day: PersonAttendanceDay | undefined,
): "absent" | "leave" | "off" | null {
  if (day == null || isWorked(day)) return null;
  if (day.status === "absent") return "absent";
  if (day.status === "on_leave" || day.status === "paid_leave") return "leave";
  if (day.status === "holiday" || day.status === "week_off") return "off";
  return null;
}

const WEEKDAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
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

/** "Tue, 3 Nov 2026" for `2026-11-03`, the same in every runtime. */
export function formatLongDate(date: string): string {
  const at = new Date(`${date}T00:00:00Z`);
  return `${WEEKDAY_NAMES[at.getUTCDay()] ?? ""}, ${String(at.getUTCDate())} ${MONTH_NAMES[at.getUTCMonth()] ?? ""} ${String(at.getUTCFullYear())}`;
}

const monthTitle = new Intl.DateTimeFormat("en-IN", {
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});
const monthLong = new Intl.DateTimeFormat("en-IN", {
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

/** "Nov 2026" for `2026-11`. */
export function formatMonth(month: string, style: "short" | "long" = "short") {
  const date = new Date(`${month}-01T00:00:00Z`);
  return (style === "long" ? monthLong : monthTitle).format(date);
}

/** `HH:MM` as "9:05 am". */
export function formatClock(time: string): string {
  const [h = 0, m = 0] = time.split(":").map(Number);
  const suffix = h < 12 ? "am" : "pm";
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${String(hour)}:${String(m).padStart(2, "0")} ${suffix}`;
}

/** One place on a day in words, for the hover and the day's label. */
export function placeLine(place: PersonAttendancePlace): {
  name: string;
  figure: string;
  detail: string[];
} {
  const detail: string[] = [];
  if (place.heads != null) {
    const parts = [`${String(place.heads.full)} full`];
    if (place.heads.half > 0) parts.push(`${String(place.heads.half)} half`);
    detail.push(parts.join(" · "));
  }
  if (place.status != null && place.status !== "present")
    detail.push(STATUS_LABELS[place.status]);
  if (place.checkIn != null)
    detail.push(
      `${formatClock(place.checkIn)} – ${place.checkOut == null ? "…" : formatClock(place.checkOut)}`,
    );
  if (place.open) detail.push("No check-out");
  if (place.pending) detail.push("Awaiting approval");
  if (place.hoursFrom === "working_hours") detail.push("No times recorded");
  if (place.overtimeMinutes > 0)
    detail.push(`Overtime ${formatMinutes(place.overtimeMinutes)}`);
  const figure =
    place.heads != null
      ? `${countFigure(place.heads.headDays)} head-days`
      : place.hoursFrom === "none" && place.workedMinutes === 0
        ? "—"
        : formatMinutes(place.workedMinutes);
  return { name: place.place.name, figure, detail };
}

/** A day in one sentence: the calendar button's label. */
export function dayLabel(
  date: string,
  day: PersonAttendanceDay | undefined,
  measure: Measure,
): string {
  const when = formatLongDate(date);
  if (day == null) return `${when}: nothing recorded`;
  const total =
    measure === "head_days"
      ? `${countFigure(day.headDays ?? 0)} head-days`
      : formatMinutes(day.workedMinutes);
  const places = day.places
    .map((place) => {
      const line = placeLine(place);
      return [line.name, line.figure, ...line.detail].join(", ");
    })
    .join("; ");
  return `${when}: ${STATUS_LABELS[day.status]}, ${total}${places === "" ? "" : `. ${places}`}`;
}
