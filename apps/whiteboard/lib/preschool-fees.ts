// What the Preschool fee screens show: labels, dates and the few figures they
// work out. Pure, so they can be tested.

import { formatPaiseAsRupees } from "@/lib/money";
import { FREQUENCIES_BY_KIND } from "@/src/preschool/domain/fee-structure";
import type { FeeFrequency, InvoiceStatus } from "@/src/preschool/domain/fees";
import { indianMobileNumber } from "@/src/preschool/domain/fee-reminder";
import type { FeePaymentMethod } from "@/src/preschool/application/fee-views";

export const FEE_PAYMENT_METHODS: readonly {
  value: FeePaymentMethod;
  label: string;
}[] = [
  { value: "cash", label: "Cash" },
  { value: "upi", label: "UPI" },
  { value: "card", label: "Card" },
  { value: "cheque", label: "Cheque" },
  { value: "bank_transfer", label: "Bank transfer" },
];

export const FEE_PAYMENT_METHOD_LABEL: Record<FeePaymentMethod, string> = {
  cash: "Cash",
  upi: "UPI",
  card: "Card",
  cheque: "Cheque",
  bank_transfer: "Bank transfer",
};

/** The reference field's label for a method; cash has none. */
export function feeReferenceLabel(method: FeePaymentMethod): string | null {
  switch (method) {
    case "cash":
      return null;
    case "upi":
      return "UPI reference";
    case "card":
      return "Card reference";
    case "cheque":
      return "Cheque number";
    case "bank_transfer":
      return "Bank reference";
  }
}

export const INVOICE_STATUS_LABEL: Record<InvoiceStatus, string> = {
  paid: "Paid",
  partly_paid: "Partly paid",
  overdue: "Overdue",
  due: "Due today",
  upcoming: "Upcoming",
  cancelled: "Cancelled",
};

export const INVOICE_STATUS_VARIANT: Record<
  InvoiceStatus,
  "default" | "secondary" | "destructive" | "outline"
> = {
  paid: "secondary",
  partly_paid: "outline",
  overdue: "destructive",
  due: "default",
  upcoming: "outline",
  cancelled: "outline",
};

export const FEE_FREQUENCY_LABEL: Record<FeeFrequency, string> = {
  one_time: "One time",
  monthly: "Monthly",
  quarterly: "Quarterly",
  term: "Per term",
  annual: "Annual",
};

/** The frequencies a Fee Head of this kind may be charged at, as options. */
export function frequencyOptions(
  kind: "one_time" | "recurring",
): { value: FeeFrequency; label: string }[] {
  return FREQUENCIES_BY_KIND[kind].map((value) => ({
    value,
    label: FEE_FREQUENCY_LABEL[value],
  }));
}

/** "25 Nov 2026" — a calendar date (YYYY-MM-DD), read as written. */
export function feeDateLabel(date: string): string {
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: "UTC",
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(`${date}T00:00:00.000Z`));
}

/** The 1st of the month a date falls in. */
export function monthStartOf(date: string): string {
  return `${date.slice(0, 8)}01`;
}

/** What the Collect dialog offers first: the overdue amount, else all that is due. */
export function suggestedPaymentPaise(due: {
  duePaise: number;
  overduePaise: number;
}): number {
  return due.overduePaise > 0 ? due.overduePaise : due.duePaise;
}

export function childFullName(child: {
  firstName: string;
  lastName: string | null;
}): string {
  return child.lastName == null || child.lastName === ""
    ? child.firstName
    : `${child.firstName} ${child.lastName}`;
}

export type ParentContact = { name: string | null; phone: string };

/**
 * The parent to reach about fees: the first of father and mother with an
 * Indian mobile number, else the first with any phone. Null without a phone.
 */
export function parentContact(family: {
  fatherName: string | null;
  fatherPhone: string | null;
  motherName: string | null;
  motherPhone: string | null;
}): ParentContact | null {
  const parents = [
    { name: family.fatherName, phone: family.fatherPhone },
    { name: family.motherName, phone: family.motherPhone },
  ].filter(
    (parent): parent is ParentContact =>
      parent.phone != null && parent.phone.trim() !== "",
  );
  return (
    parents.find((parent) => indianMobileNumber(parent.phone) != null) ??
    parents[0] ??
    null
  );
}

/**
 * A WhatsApp share of a Receipt with no number filled in: the Centre picks
 * the chat. Short enough to read in a notification.
 */
export function receiptShareUrl(receipt: {
  centreName: string;
  childName: string;
  receiptNumber: string;
  receivedOn: string;
  amountPaise: number;
  balanceDuePaise: number;
}): string {
  const text =
    `${receipt.centreName}: Fee Receipt ${receipt.receiptNumber} — ` +
    `${formatPaiseAsRupees(receipt.amountPaise)} received for ${receipt.childName} ` +
    `on ${feeDateLabel(receipt.receivedOn)}. ` +
    `Balance due: ${formatPaiseAsRupees(receipt.balanceDuePaise)}. Thank you.`;
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}

/** Print rules for a Receipt: no app chrome, small margins, A5 or A4. */
export const RECEIPT_PRINT_CSS = `
@page {
  margin: 10mm;
}
@media print {
  [data-slot="sidebar"],
  [data-slot="sidebar-gap"],
  [data-slot="sidebar-container"] {
    display: none !important;
  }
  [data-slot="sidebar-wrapper"] {
    display: block !important;
    min-height: 0 !important;
  }
  [data-slot="sidebar-inset"] {
    margin: 0 !important;
    padding: 0 !important;
    border: 0 !important;
    box-shadow: none !important;
  }
  html,
  body {
    background: #fff !important;
  }
  .fee-receipt {
    border: 0 !important;
    box-shadow: none !important;
    max-width: none !important;
    font-size: 10pt;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .fee-receipt tr {
    break-inside: avoid;
  }
}
`;
