import { formatMinor } from "@/src/shared-kernel/money";
import type { SalarySlipModel } from "@/src/queries/hrms-salary";

/** Words and formats shared by the salary screens (CM-317). */

export const SALARY_STATUS_LABELS: Record<SalarySlipModel["status"], string> = {
  calculated: "Calculated",
  approved: "Approved",
  paid: "Paid",
};

export function salaryStatusVariant(
  status: SalarySlipModel["status"],
): "default" | "secondary" | "outline" {
  switch (status) {
    case "paid":
      return "default";
    case "approved":
      return "secondary";
    default:
      return "outline";
  }
}

/** `₹1,00,000.00`, or an em dash when amounts are hidden. */
export function money(paise: number | null | undefined): string {
  return paise == null ? "—" : formatMinor(paise);
}

/** `29.5 days`, `1 day`. */
export function days(value: number): string {
  const text = Number.isInteger(value) ? String(value) : value.toFixed(1);
  return `${text} ${value === 1 ? "day" : "days"}`;
}

export function hours(value: number): string {
  return `${String(Number(value.toFixed(2)))} h`;
}

/** "2026-10" → "October 2026". */
export function monthLabel(month: string): string {
  return new Intl.DateTimeFormat("en-IN", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${month}-01T00:00:00Z`));
}

export function shiftMonth(month: string, by: number): string {
  const [year, number] = month.split("-").map(Number) as [number, number];
  const index = year * 12 + number - 1 + by;
  return `${String(Math.floor(index / 12))}-${String((index % 12) + 1).padStart(2, "0")}`;
}

/** Today on this device, `YYYY-MM-DD`. */
export function localToday(now: Date = new Date()): string {
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${String(now.getFullYear())}-${month}-${day}`;
}

const DAY_FORMAT = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

/** `5 Oct 2026` for a calendar date. */
export function formatDate(date: string): string {
  return DAY_FORMAT.format(new Date(`${date.slice(0, 10)}T00:00:00.000Z`));
}

export const PAYMENT_MODE_LABELS = { cash: "Cash", bank: "Bank" } as const;
