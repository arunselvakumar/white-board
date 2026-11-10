import { formatMobile } from "@repo/auth/construction/mobile";

import {
  formatPaise,
  isRupees,
  rupeesToPaise,
} from "@/components/money/money-input";
import type {
  ProjectDateField,
  ProjectReferenceField,
} from "@/src/projects/domain/project-contract-rules";
import type { ProjectDocumentKind } from "@/src/projects/domain/project-document-rules";

/**
 * The papers that gave the Company a Project (CM-413, ADR CM-0010), in the
 * order they happen. `optional` papers show on the form only once they have
 * a value or the user asks for them; the Tender / RFQ ref. has no date.
 */
export const PROJECT_PAPERS = [
  {
    kind: "tender",
    label: "Tender / RFQ ref.",
    numberField: "tenderRef",
    dateField: null,
    optional: true,
  },
  {
    kind: "quotation",
    label: "Quotation",
    numberField: "quotationNo",
    dateField: "quotationDate",
    optional: false,
  },
  {
    kind: "loa",
    label: "LOA",
    numberField: "loaNo",
    dateField: "loaDate",
    optional: true,
  },
  {
    kind: "client_order",
    label: "PO / WO",
    numberField: "clientOrderNo",
    dateField: "clientOrderDate",
    optional: false,
  },
  {
    kind: "agreement",
    label: "Agreement",
    numberField: "agreementNo",
    dateField: "agreementDate",
    optional: true,
  },
] as const satisfies readonly {
  kind: Exclude<ProjectDocumentKind, "other">;
  label: string;
  numberField: ProjectReferenceField;
  dateField: ProjectDateField | null;
  optional: boolean;
}[];

export type ProjectPaper = (typeof PROJECT_PAPERS)[number];
export type ProjectPaperKind = ProjectPaper["kind"];

/** `+919843122110` → `+91 98431 22110`. */
export function clientPhoneLabel(phone: string): string {
  return formatMobile(phone);
}

/** `₹1,84,50,000` (no `.00` when there are no paise), `₹1,84,50,000.50`. */
export function orderValueLabel(paise: number): string {
  return formatPaise(paise).replace(/\.00$/, "");
}

const GROUPING = new Map<number, Intl.NumberFormat>();

/**
 * Rupees as typed, regrouped the Indian way for the input:
 * `18450000` → `1,84,50,000`, `18450000.5` → `1,84,50,000.50`. Anything
 * that is not an amount is left as typed, for the form to flag.
 */
export function groupRupees(value: string): string {
  if (!isRupees(value)) return value;
  const paise = rupeesToPaise(value);
  if (paise == null || Number.isNaN(paise)) return value;
  const digits = paise % 100 === 0 ? 0 : 2;
  let format = GROUPING.get(digits);
  if (format == null) {
    format = new Intl.NumberFormat("en-IN", {
      minimumFractionDigits: digits,
      maximumFractionDigits: 2,
    });
    GROUPING.set(digits, format);
  }
  return format.format(paise / 100);
}
