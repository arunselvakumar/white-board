import type { FeeHeadKind } from "../domain/fee-structure";
import type { FeeFrequency, InvoiceStatus } from "../domain/fees";

// JSON-ready. Money is whole paise; calendar dates are YYYY-MM-DD.

export type FeePaymentMethod =
  "cash" | "upi" | "card" | "cheque" | "bank_transfer";

export type FeeHeadView = {
  id: string;
  name: string;
  kind: FeeHeadKind;
  /** Collections count towards a Franchised Centre's royalty. */
  royaltyBearing: boolean;
  refundable: boolean;
  sortOrder: number;
  isArchived: boolean;
};

export type FeeHeadListView = { items: FeeHeadView[] };

export type FeeStructureLineView = {
  feeHeadId: string;
  feeHeadName: string;
  kind: FeeHeadKind;
  /** One instalment at `frequency`. */
  amountPaise: number;
  frequency: FeeFrequency;
};

export type FeeStructureView = {
  id: string;
  academicYearId: string;
  programmeId: string;
  /** Null for the Workspace default. */
  centreId: string | null;
  items: FeeStructureLineView[];
  /** What the lines come to over the whole Academic Year. */
  annualPaise: number;
};

export type ProgrammeFeeStructuresView = {
  programmeId: string;
  programmeName: string;
  default: FeeStructureView | null;
  /** The Centre's own amounts; only when a Centre was asked for. */
  override: FeeStructureView | null;
  /** The override when there is one, else the default. */
  effective: FeeStructureView | null;
};

export type FeeStructureListView = {
  academicYear: { id: string; name: string };
  centreId: string | null;
  /** Whether the Centre may hold its own amounts; null without a Centre. */
  mayOverride: boolean | null;
  items: ProgrammeFeeStructuresView[];
};

export type InvoiceView = {
  id: string;
  admissionId: string;
  feeHeadId: string;
  feeHeadName: string;
  label: string;
  dueOn: string;
  amountPaise: number;
  concessionPaise: number;
  concessionReason: string | null;
  paidPaise: number;
  /** Amount less concession and payments; zero when cancelled. */
  duePaise: number;
  status: InvoiceStatus;
};

export type FeePaymentSummaryView = {
  id: string;
  receiptNumber: string;
  receivedOn: string;
  amountPaise: number;
  method: FeePaymentMethod;
  reference: string | null;
  /** Cancelled: kept for the record, counts for nothing. */
  cancelled: boolean;
};

export type FeeChildView = {
  id: string;
  centreId: string;
  firstName: string;
  lastName: string | null;
  admissionNumber: string;
  status: "active" | "withdrawn" | "graduated";
  classroom: { id: string; name: string } | null;
  programme: { id: string; name: string } | null;
  academicYear: { id: string; name: string } | null;
  fatherName: string | null;
  fatherPhone: string | null;
  motherName: string | null;
  motherPhone: string | null;
};

export type FeeTotalsView = {
  billedPaise: number;
  concessionPaise: number;
  paidPaise: number;
  duePaise: number;
  /** Due on Invoices whose due date is before today. */
  overduePaise: number;
};

/**
 * A Child's fee account: Invoices of the active Admission (cancelled ones
 * included) and any earlier Invoice still unpaid, every Fee Payment newest
 * first, and totals over the Invoices listed.
 */
export type ChildFeeAccountView = {
  child: FeeChildView;
  invoices: InvoiceView[];
  payments: FeePaymentSummaryView[];
  totals: FeeTotalsView;
};

export type FeePaymentListItemView = FeePaymentSummaryView & {
  childId: string;
  childName: string;
  admissionNumber: string;
  recordedByName: string;
};

export type FeePaymentListView = {
  items: FeePaymentListItemView[];
  /** Pass as `cursor` for the next page; null on the last one. */
  nextCursor: string | null;
  /** Payments in the range. */
  total: number;
  /** The sum of those not cancelled. */
  totalPaise: number;
};

export type ReceiptView = {
  id: string;
  receiptNumber: string;
  receivedOn: string;
  centre: {
    id: string;
    name: string;
    addressLine: string | null;
    city: string | null;
    state: string | null;
    pincode: string | null;
    phone: string | null;
  };
  child: {
    id: string;
    firstName: string;
    lastName: string | null;
    admissionNumber: string;
    classroomName: string | null;
    fatherName: string | null;
    motherName: string | null;
  };
  lines: { invoiceId: string; label: string; amountPaise: number }[];
  amountPaise: number;
  /** "Rupees Twelve Thousand Five Hundred Only" */
  amountInWords: string;
  method: FeePaymentMethod;
  reference: string | null;
  note: string | null;
  receivedByName: string;
  /** What the Child still owed straight after this payment. */
  balanceDuePaise: number;
  /** Set once the Receipt is cancelled; it then counts for nothing. */
  cancellation: {
    cancelledAt: string;
    cancelledByName: string;
    reason: string;
  } | null;
};

export type DuesRowView = {
  childId: string;
  firstName: string;
  lastName: string | null;
  admissionNumber: string;
  classroom: { id: string; name: string } | null;
  fatherName: string | null;
  fatherPhone: string | null;
  motherName: string | null;
  motherPhone: string | null;
  duePaise: number;
  overduePaise: number;
  oldestDueOn: string;
  invoiceCount: number;
};

export type DuesListView = { items: DuesRowView[] };

export type FeeSummaryView = {
  collectedTodayPaise: number;
  collectedThisMonthPaise: number;
  duePaise: number;
  overduePaise: number;
  childrenWithDues: number;
};
