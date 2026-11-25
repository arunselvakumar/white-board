import type { FeeHeadKind } from "../domain/fee-structure";
import type { Allocation, FeeFrequency } from "../domain/fees";
import type {
  DuesRowView,
  FeeChildView,
  FeeHeadView,
  FeePaymentListView,
  FeePaymentMethod,
  FeePaymentSummaryView,
  FeeStructureView,
  FeeSummaryView,
  ReceiptView,
} from "./fee-views";

export type FeeHeadFields = {
  name: string;
  kind: FeeHeadKind;
  royaltyBearing: boolean;
  refundable: boolean;
};

export type FeeHeadStore = {
  /** In display order. */
  list(workspaceId: string, includeArchived: boolean): Promise<FeeHeadView[]>;
  find(workspaceId: string, id: string): Promise<FeeHeadView | null>;
  /** Another Fee Head that is not archived has this name, ignoring case. */
  nameTaken(
    workspaceId: string,
    name: string,
    exceptId?: string,
  ): Promise<boolean>;
  /** Adds it last in the order. */
  create(workspaceId: string, fields: FeeHeadFields): Promise<FeeHeadView>;
  update(
    workspaceId: string,
    id: string,
    fields: FeeHeadFields,
  ): Promise<FeeHeadView>;
  setArchivedAt(
    workspaceId: string,
    id: string,
    archivedAt: Date | null,
  ): Promise<FeeHeadView>;
  /** The Fee Head is a line on some Fee Structure. */
  onAnyStructure(workspaceId: string, id: string): Promise<boolean>;
};

export type FeeStructureKey = {
  academicYearId: string;
  programmeId: string;
  /** Null for the Workspace default. */
  centreId: string | null;
};

export type FeeStructureLine = {
  feeHeadId: string;
  amountPaise: number;
  frequency: FeeFrequency;
};

export type FeeStructureStore = {
  /** The given year, or the current one without an id. */
  academicYear(
    workspaceId: string,
    id?: string,
  ): Promise<{ id: string; name: string } | null>;
  /** Programmes that are not archived, in display order. */
  programmes(workspaceId: string): Promise<{ id: string; name: string }[]>;
  programme(
    workspaceId: string,
    id: string,
  ): Promise<{ id: string; name: string; isArchived: boolean } | null>;
  centre(
    workspaceId: string,
    id: string,
  ): Promise<{ id: string; mayOverrideFees: boolean } | null>;
  /** The year's defaults, and the Centre's overrides when a Centre is given. */
  structures(
    workspaceId: string,
    academicYearId: string,
    centreId: string | null,
  ): Promise<FeeStructureView[]>;
  find(
    workspaceId: string,
    key: FeeStructureKey,
  ): Promise<FeeStructureView | null>;
  findById(workspaceId: string, id: string): Promise<FeeStructureView | null>;
  feeHeads(
    workspaceId: string,
    ids: readonly string[],
  ): Promise<
    { id: string; name: string; kind: FeeHeadKind; isArchived: boolean }[]
  >;
  /** Replaces every line of the structure, creating it when there is none. */
  save(
    workspaceId: string,
    key: FeeStructureKey,
    lines: readonly FeeStructureLine[],
  ): Promise<FeeStructureView>;
  remove(workspaceId: string, id: string): Promise<void>;
};

/** A Child as the fee screens need them, with the active Admission. */
export type FeeChildRecord = FeeChildView & {
  activeAdmissionId: string | null;
};

export type InvoiceRecord = {
  id: string;
  centreId: string;
  childId: string;
  admissionId: string;
  feeHeadId: string;
  feeHeadName: string;
  label: string;
  dueOn: string;
  amountPaise: number;
  concessionPaise: number;
  concessionReason: string | null;
  paidPaise: number;
  cancelled: boolean;
};

export type InvoiceChange = Partial<{
  label: string;
  dueOn: string;
  amountPaise: number;
  concessionPaise: number;
  concessionReason: string | null;
  cancelledAt: Date;
}>;

export type FeeAccountStore = {
  child(workspaceId: string, childId: string): Promise<FeeChildRecord | null>;
  /**
   * The active Admission's Invoices, and other Admissions' Invoices that are
   * not cancelled and still owe something, by due date.
   */
  invoices(
    workspaceId: string,
    childId: string,
    activeAdmissionId: string | null,
  ): Promise<InvoiceRecord[]>;
  /** Newest first. */
  payments(
    workspaceId: string,
    childId: string,
  ): Promise<FeePaymentSummaryView[]>;
  feeHead(
    workspaceId: string,
    id: string,
  ): Promise<{ id: string; name: string; isArchived: boolean } | null>;
  /** Returns the new id. */
  createInvoice(
    workspaceId: string,
    input: {
      centreId: string;
      childId: string;
      admissionId: string;
      feeHeadId: string;
      label: string;
      dueOn: string;
      amountPaise: number;
    },
  ): Promise<string>;
  invoice(workspaceId: string, id: string): Promise<InvoiceRecord | null>;
  /**
   * Locks the Invoice, asks `change` what to write given its current state
   * (which may throw), and writes it in the same transaction.
   */
  changeInvoice(
    workspaceId: string,
    id: string,
    change: (invoice: InvoiceRecord) => InvoiceChange,
  ): Promise<InvoiceRecord>;
};

export type InvoiceGenerationResult =
  "created" | "already_invoiced" | "no_structure";

/** Raises an Admission's Invoices from the Fee Structure in force. */
export type InvoiceGenerator = {
  generate(admissionId: string): Promise<InvoiceGenerationResult>;
};

export type RecordPaymentInput = {
  centreId: string;
  childId: string;
  /** Names the Receipt number's year. */
  academicYearName: string;
  amountPaise: number;
  method: FeePaymentMethod;
  receivedOn: string;
  reference: string | null;
  note: string | null;
  recordedByUserId: string;
  recordedByName: string;
  /** Allocate only across these Invoices of the Child. */
  invoiceIds: readonly string[] | null;
  /** Given the Child's locked unpaid Invoices, how the payment is spread. */
  allocate: (
    invoices: readonly {
      id: string;
      label: string;
      dueOn: string;
      duePaise: number;
    }[],
  ) => Allocation[];
};

export type ReceiptRecord = Omit<ReceiptView, "amountInWords">;

export type FeePaymentStore = {
  /**
   * In one transaction: locks the Child's unpaid Invoices, allocates, writes
   * the payment and allocations, raises each Invoice's paid amount and takes
   * the Centre's next Receipt number. Returns the payment id.
   */
  record(workspaceId: string, input: RecordPaymentInput): Promise<string>;
  list(
    workspaceId: string,
    query: {
      centreId: string;
      from: string | null;
      to: string | null;
      limit: number;
      cursor: string | null;
    },
  ): Promise<FeePaymentListView>;
  receipt(workspaceId: string, id: string): Promise<ReceiptRecord | null>;
  /** The Centre and Child of a payment, for access checks. */
  owner(
    workspaceId: string,
    id: string,
  ): Promise<{ centreId: string; childId: string } | null>;
};

export type FeeReportStore = {
  /** One row per Child of the Centre who owes something. */
  dues(
    workspaceId: string,
    query: { centreId: string; classroomId: string | null; today: string },
  ): Promise<DuesRowView[]>;
  summary(
    workspaceId: string,
    query: {
      centreIds: readonly string[];
      today: string;
      monthStartsOn: string;
    },
  ): Promise<FeeSummaryView>;
};
