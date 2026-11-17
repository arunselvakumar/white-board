import { formatPaise, paiseToRupees } from "@/components/money/money-input";
import { type AppHref, type HrefSuffix, pageHref } from "@/lib/page-href";
import type { Invoice, PartyType } from "@/src/queries/finance-parties";

/**
 * Words, paths and formats the party money screens share (Suppliers,
 * Contractors and Other Parties). Every screen takes a `partyType`.
 */

export type PartyScreen = {
  type: PartyType;
  label: string;
  plural: string;
  /** Contractors deduct TDS. */
  tds: boolean;
};

export const PARTY_SCREENS: Record<PartyType, PartyScreen> = {
  contractor: {
    type: "contractor",
    label: "Contractor",
    plural: "Contractors",
    tds: true,
  },
  supplier: {
    type: "supplier",
    label: "Supplier",
    plural: "Suppliers",
    tds: false,
  },
  other_party: {
    type: "other_party",
    label: "Other Party",
    plural: "Other Parties",
    tds: false,
  },
};

/** Where a party type's screens live under the Project's Payments. */
export type PartyPaths = {
  tab: AppHref;
  party: (partyId: string) => AppHref;
  pay: (partyId?: string | null, direction?: "in" | "out") => AppHref;
  payment: (paymentId: string) => AppHref;
};

/** The Pay screen's query: the party picked, and Receive instead of Pay. */
function payQuery(
  partyId: string | null | undefined,
  direction: "in" | "out" | undefined,
): HrefSuffix {
  const query = new URLSearchParams();
  if (partyId != null) query.set("partyId", partyId);
  if (direction === "in") query.set("direction", "in");
  const text = query.toString();
  return text === "" ? "" : `?${text}`;
}

/**
 * Each party type's pages, named by their folders (ADR CM-0045): the three
 * types have the same pages under their own Payments tab.
 */
const PARTY_PATHS: Record<PartyType, (id: string) => PartyPaths> = {
  contractor: (id) => ({
    tab: pageHref("/app/projects/[id]/payments/contractors", { id }),
    party: (partyId) =>
      pageHref("/app/projects/[id]/payments/contractors/[partyId]", {
        id,
        partyId,
      }),
    pay: (partyId, direction) =>
      pageHref(
        "/app/projects/[id]/payments/contractors/pay",
        { id },
        payQuery(partyId, direction),
      ),
    payment: (paymentId) =>
      pageHref("/app/projects/[id]/payments/contractors/payments/[paymentId]", {
        id,
        paymentId,
      }),
  }),
  supplier: (id) => ({
    tab: pageHref("/app/projects/[id]/payments/suppliers", { id }),
    party: (partyId) =>
      pageHref("/app/projects/[id]/payments/suppliers/[partyId]", {
        id,
        partyId,
      }),
    pay: (partyId, direction) =>
      pageHref(
        "/app/projects/[id]/payments/suppliers/pay",
        { id },
        payQuery(partyId, direction),
      ),
    payment: (paymentId) =>
      pageHref("/app/projects/[id]/payments/suppliers/payments/[paymentId]", {
        id,
        paymentId,
      }),
  }),
  other_party: (id) => ({
    tab: pageHref("/app/projects/[id]/payments/other-parties", { id }),
    party: (partyId) =>
      pageHref("/app/projects/[id]/payments/other-parties/[partyId]", {
        id,
        partyId,
      }),
    pay: (partyId, direction) =>
      pageHref(
        "/app/projects/[id]/payments/other-parties/pay",
        { id },
        payQuery(partyId, direction),
      ),
    payment: (paymentId) =>
      pageHref(
        "/app/projects/[id]/payments/other-parties/payments/[paymentId]",
        { id, paymentId },
      ),
  }),
};

export function partyPaths(
  projectId: string,
  partyType: PartyType,
): PartyPaths {
  return PARTY_PATHS[partyType](projectId);
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
