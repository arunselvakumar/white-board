import type { StockLocation } from "@/src/procurement/domain/stock-location";

const QUANTITY = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 3 });

/** `1234.500` → `1,234.5`; null → a dash. */
export function formatQuantity(value: string | null | undefined): string {
  if (value == null) return "—";
  const number = Number(value);
  return Number.isFinite(number) ? QUANTITY.format(number) : value;
}

/** A signed movement: `+120`, `−5.5`. */
export function formatSigned(value: string): string {
  const number = Number(value);
  if (!Number.isFinite(number) || number === 0) return formatQuantity(value);
  return `${number > 0 ? "+" : "−"}${QUANTITY.format(Math.abs(number))}`;
}

/** `2026-10-04` → `4 Oct 2026`. */
export function formatDate(date: string): string {
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${date}T00:00:00Z`));
}

/** Today on this device, `YYYY-MM-DD` (the server checks the Company's today). */
export function localToday(now: Date = new Date()): string {
  const offset = now.getTimezoneOffset() * 60_000;
  return new Date(now.getTime() - offset).toISOString().slice(0, 10);
}

/** A quantity a user typed: digits with at most 3 decimals. */
export const QUANTITY_PATTERN = /^\d{1,11}(\.\d{1,3})?$/;

/** Pages of a location's Current Inventory. */
export function inventoryPath(
  location: StockLocation,
  page?: "register",
): string {
  if (location.kind !== "project") return "";
  const base = `/app/projects/${encodeURIComponent(location.id)}/materials/inventory`;
  return page == null ? base : `${base}/${page}`;
}
