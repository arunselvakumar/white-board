// How Reports write money, dates and percentages (Reports PRD §6.7). Every
// output (screen, print, Excel, PDF, email) shows the same text, so the text
// is made once, on the server. Keep this file free of server-only imports.

const MONTHS = [
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
] as const;

const LONG_MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

/** Indian digit grouping: 1,25,000. */
export function indianGrouping(value: number): string {
  const negative = value < 0;
  const digits = String(Math.trunc(Math.abs(value)));
  const last3 = digits.slice(-3);
  const rest = digits.slice(0, -3);
  const grouped =
    rest.length === 0
      ? last3
      : `${rest.replace(/\B(?=(\d{2})+(?!\d))/g, ",")},${last3}`;
  return `${negative ? "-" : ""}${grouped}`;
}

/** ₹1,25,000, with paise only when there are some: ₹1,250.50. */
export function formatRupees(paise: number): string {
  const negative = paise < 0;
  const absolute = Math.abs(Math.round(paise));
  const rupees = Math.trunc(absolute / 100);
  const rest = absolute % 100;
  const text = `₹${indianGrouping(rupees)}${rest === 0 ? "" : `.${String(rest).padStart(2, "0")}`}`;
  return negative ? `-${text}` : text;
}

/** "12 Oct 2026" from "2026-10-12". */
export function formatReportDate(date: string): string {
  const [year, month, day] = date.split("-").map(Number);
  return `${String(day ?? 1)} ${MONTHS[(month ?? 1) - 1] ?? ""} ${String(year ?? 0)}`;
}

/** "Sat 18 Oct" from "2026-10-18". */
export function formatShortDay(date: string): string {
  const [, month, day] = date.split("-").map(Number);
  const weekday = new Date(`${date}T00:00:00.000Z`).getUTCDay();
  return `${WEEKDAYS[weekday] ?? ""} ${String(day ?? 1)} ${MONTHS[(month ?? 1) - 1] ?? ""}`;
}

/** "12" from "2026-10-12": a column heading in a monthly grid. */
export function formatDayOfMonth(date: string): string {
  return String(Number(date.slice(8, 10)));
}

/** "October 2026" from "2026-10". */
export function formatMonth(month: string): string {
  const [year, value] = month.split("-").map(Number);
  return `${LONG_MONTHS[(value ?? 1) - 1] ?? ""} ${String(year ?? 0)}`;
}

/** "Oct 2026" from "2026-10". */
export function formatShortMonth(month: string): string {
  const [year, value] = month.split("-").map(Number);
  return `${MONTHS[(value ?? 1) - 1] ?? ""} ${String(year ?? 0)}`;
}

/** "4 PM", "9:30 AM" from "16:00", "09:30". */
export function formatClock(clock: string): string {
  const [hour = 0, minute = 0] = clock.split(":").map(Number);
  const suffix = hour < 12 ? "AM" : "PM";
  const twelve = hour % 12 === 0 ? 12 : hour % 12;
  return minute === 0
    ? `${String(twelve)} ${suffix}`
    : `${String(twelve)}:${String(minute).padStart(2, "0")} ${suffix}`;
}

/** "9 AM – 11 AM". */
export function formatTimeRange(startTime: string, endTime: string): string {
  return `${formatClock(startTime)} – ${formatClock(endTime)}`;
}

/** "1 Oct 2026 – 31 Oct 2026", or one date when both are the same. */
export function formatPeriod(from: string, to: string): string {
  return from === to
    ? formatReportDate(from)
    : `${formatReportDate(from)} – ${formatReportDate(to)}`;
}

/** "13 Oct 2026, 10:40 AM" in the institute's time zone. */
export function formatGeneratedAt(now: Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const part = (name: string) =>
    parts.find((value) => value.type === name)?.value ?? "00";
  return `${formatReportDate(`${part("year")}-${part("month")}-${part("day")}`)}, ${formatClock(`${part("hour")}:${part("minute")}`)}`;
}

/** "83%", or "–" when nothing counts. */
export function formatPercent(percent: number | null): string {
  return percent == null ? "–" : `${String(percent)}%`;
}

/** Whole-number share, or null when there is nothing to share. */
export function percentOf(part: number, whole: number): number | null {
  return whole <= 0 ? null : Math.round((part / whole) * 100);
}

/** "6 h", "1 h 30 m", "45 m". */
export function formatMinutes(minutes: number): string {
  const hours = Math.trunc(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${String(rest)} m`;
  return rest === 0
    ? `${String(hours)} h`
    : `${String(hours)} h ${String(rest)} m`;
}

/** Marks with at most one decimal: 34, 34.5. */
export function formatMarks(marks: number): string {
  return Number.isInteger(marks) ? String(marks) : marks.toFixed(1);
}
