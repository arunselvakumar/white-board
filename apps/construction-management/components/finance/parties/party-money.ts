import { formatPaise, paiseToRupees } from "@/components/money/money-input";
import { paymentsPath } from "@/components/finance/payments-hub/payments-tabs";
import type { Invoice, PartyType } from "@/src/queries/finance-parties";

/**
 * Words, paths and formats the party money screens share (CM-705, CM-706,
 * and CM-708 for Other Parties). Every screen takes a `partyType`.
 */

export type PartyScreen = {
  type: PartyType;
  label: string;
  plural: string;
  segment: "contractors" | "suppliers" | "other-parties";
  /** Contractors deduct TDS (CM-706). */
  tds: boolean;
};

export const PARTY_SCREENS: Record<PartyType, PartyScreen> = {
  contractor: {
    type: "contractor",
    label: "Contractor",
    plural: "Contractors",
    segment: "contractors",
    tds: true,
  },
  supplier: {
    type: "supplier",
    label: "Supplier",
    plural: "Suppliers",
    segment: "suppliers",
    tds: false,
  },
  other_party: {
    type: "other_party",
    label: "Other Party",
    plural: "Other Parties",
    segment: "other-parties",
    tds: false,
  },
};

/** Where a party type's screens live under the Project's Payments. */
export function partyPaths(projectId: string, partyType: PartyType) {
  const base = paymentsPath(projectId, PARTY_SCREENS[partyType].segment);
  return {
    tab: base,
    party: (partyId: string) => `${base}/${encodeURIComponent(partyId)}`,
    pay: (partyId?: string | null, direction?: "in" | "out") => {
      const query = new URLSearchParams();
      if (partyId != null) query.set("partyId", partyId);
      if (direction === "in") query.set("direction", "in");
      const text = query.toString();
      return `${base}/pay${text === "" ? "" : `?${text}`}`;
    },
    payment: (paymentId: string) =>
      `${base}/payments/${encodeURIComponent(paymentId)}`,
  };
}

export function money(paise: number | null | undefined): string {
  return paise == null ? "—" : formatPaise(paise);
}

export { paiseToRupees };

/** `2026-10-04` → `4 Oct 2026`. */
export function formatDate(date: string | null | undefined): string {
  if (date == null) return "—";
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${date}T00:00:00Z`));
}

/** Today on this device, `YYYY-MM-DD`. */
export function localToday(now: Date = new Date()): string {
  const offset = now.getTimezoneOffset() * 60_000;
  return new Date(now.getTime() - offset).toISOString().slice(0, 10);
}

export const INVOICE_STATUS_LABELS: Record<Invoice["status"], string> = {
  open: "Open",
  partly_paid: "Partly paid",
  paid: "Paid",
  settled: "Settled",
};

export const ENTRY_KIND_LABELS = {
  opening: "Opening balance",
  invoice: "Invoice",
  sales_invoice: "Sales invoice",
  payment: "Payment",
  receipt: "Receipt",
  tds: "TDS",
  client_tds: "TDS deducted by the Client",
  gst_tds: "GST-TDS deducted by the Client",
  write_off: "Written off",
} as const;

export const MODE_LABELS = {
  cash: "Cash",
  cheque: "Cheque",
  online: "Online",
  upi: "UPI",
} as const;

/** The financial year (its start) a date is in: April to March. */
export function financialYearOf(date: string): number {
  const [year = 0, month = 1] = date.split("-").map(Number);
  return month >= 4 ? year : year - 1;
}

/** `2026` → `2026-27`. */
export function financialYearLabel(startYear: number): string {
  return `${String(startYear)}-${String((startYear + 1) % 100).padStart(2, "0")}`;
}
