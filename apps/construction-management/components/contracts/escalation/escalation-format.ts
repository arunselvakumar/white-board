import { ESCALATION_COMPONENT_LABELS } from "@/src/contracts/domain/contract-terms";

export {
  BillStatusBadge,
  billNumber,
  dateText,
  moneyOrDash,
  percentText,
} from "../contractor-bills/contractor-bill-format";

export { ESCALATION_COMPONENT_LABELS };

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
];

/** `2026-04-01` → `Apr 2026`. */
export function monthText(value: string): string {
  return `${MONTHS[Number(value.slice(5, 7)) - 1] ?? ""} ${value.slice(0, 4)}`;
}

/** `Apr 2026 – Jun 2026`, or one month. */
export function periodText(from: string, to: string): string {
  const a = monthText(from);
  const b = monthText(to);
  return a === b ? a : `${a} – ${b}`;
}

/** `"147.0000"` → `"147"`, `"153.2500"` → `"153.25"`. */
export function indexText(value: string): string {
  return value.includes(".") ? value.replace(/\.?0+$/, "") : value;
}

/** `"-0.050000"` → `"−5.00 %"`. */
export function factorText(value: string): string {
  const percent = Number(value) * 100;
  const text = Math.abs(percent).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  });
  return `${percent < 0 ? "−" : percent > 0 ? "+" : ""}${text} %`;
}

/** Signed money: `−₹8,500.00`. */
export function signedMoney(
  paise: number | null,
  format: (value: number) => string,
): string {
  if (paise == null) return "—";
  return paise < 0 ? `−${format(-paise)}` : format(paise);
}
