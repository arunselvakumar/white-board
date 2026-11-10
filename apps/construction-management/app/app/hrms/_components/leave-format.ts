import type { LeaveRequestStatus } from "@/src/hrms/domain/leave-request";

/** Today on this device, `YYYY-MM-DD`. */
export function localToday(now: Date = new Date()): string {
  const offset = now.getTimezoneOffset() * 60_000;
  return new Date(now.getTime() - offset).toISOString().slice(0, 10);
}

/** `2026-11-06` → `6 Nov 2026`. */
export function formatDate(date: string): string {
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${date}T00:00:00Z`));
}

/** `2026-11-06` → `Fri, 6 Nov`. */
export function formatDay(date: string): string {
  return new Intl.DateTimeFormat("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(new Date(`${date}T00:00:00Z`));
}

/** `6 Nov 2026` or `6 Nov – 9 Nov 2026`. */
export function formatRange(from: string, to: string): string {
  if (from === to) return formatDate(from);
  return `${formatDate(from)} – ${formatDate(to)}`;
}

/** 1 → "1 day", 2.5 → "2.5 days", 0.58 → "0.58 days". */
export function formatDays(days: number): string {
  const rounded = Math.round(days * 100) / 100;
  return `${String(rounded)} ${rounded === 1 ? "day" : "days"}`;
}

export const STATUS_LABELS: Record<LeaveRequestStatus, string> = {
  pending: "Pending",
  approved: "Approved",
  rejected: "Rejected",
  withdrawn: "Withdrawn",
  cancellation_requested: "Cancellation requested",
  cancelled: "Cancelled",
};

export function statusVariant(
  status: LeaveRequestStatus,
): "default" | "secondary" | "destructive" | "outline" {
  switch (status) {
    case "approved":
      return "default";
    case "pending":
    case "cancellation_requested":
      return "secondary";
    case "rejected":
      return "destructive";
    default:
      return "outline";
  }
}

export const LEDGER_KIND_LABELS: Record<string, string> = {
  initial: "Opening credit",
  accrual: "Monthly credit",
  carry_forward: "Carried forward",
  adjustment: "Adjustment",
  used: "Used",
  reserved: "Held for a request",
  released: "Released",
  restored: "Restored",
};

/**
 * The leave years a screen offers around `current`: the one before, the
 * current one and the next ("2026" or "26-27", as the Settings say).
 */
export function leaveYearChoices(current: string): string[] {
  const calendar = /^(\d{4})$/.exec(current);
  if (calendar != null) {
    const year = Number(calendar[1]);
    return [year - 1, year, year + 1].map(String);
  }
  const financial = /^(\d{2})-(\d{2})$/.exec(current);
  if (financial == null) return [current];
  const first = Number(financial[1]);
  const key = (start: number) => {
    const a = (start + 100) % 100;
    return `${String(a).padStart(2, "0")}-${String((a + 1) % 100).padStart(2, "0")}`;
  };
  return [key(first - 1), key(first), key(first + 1)];
}
