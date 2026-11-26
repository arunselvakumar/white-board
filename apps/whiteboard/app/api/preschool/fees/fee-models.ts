import { z } from "zod";

// Money is whole paise; calendar dates are YYYY-MM-DD.

const Paise = z.number().int().min(0);
const FeeHeadKindModel = z.enum(["one_time", "recurring"]);
const FeeFrequencyModel = z.enum([
  "one_time",
  "monthly",
  "quarterly",
  "term",
  "annual",
]);
const FeePaymentMethodModel = z.enum([
  "cash",
  "upi",
  "card",
  "cheque",
  "bank_transfer",
]);
const InvoiceStatusModel = z.enum([
  "paid",
  "partly_paid",
  "overdue",
  "due",
  "upcoming",
  "cancelled",
]);
const RefModel = z.object({ id: z.uuid(), name: z.string() });

export const PreschoolIdParamsModel = z.object({ id: z.uuid() });
export const PreschoolChildIdParamsModel = z.object({ childId: z.uuid() });

// Fee Heads

export const PreschoolFeeHeadModel = z.object({
  id: z.uuid(),
  name: z.string(),
  kind: FeeHeadKindModel,
  royaltyBearing: z.boolean(),
  refundable: z.boolean(),
  sortOrder: z.number().int(),
  isArchived: z.boolean(),
});

export const PreschoolFeeHeadListResponseModel = z.object({
  items: z.array(PreschoolFeeHeadModel),
});

export const ListPreschoolFeeHeadsRequestModel = z.object({
  includeArchived: z.enum(["true", "false"]).optional(),
});

export const PreschoolFeeHeadDetailsRequestModel = z.object({
  name: z.string().trim().min(1).max(100),
  kind: FeeHeadKindModel,
  royaltyBearing: z.boolean().optional(),
  refundable: z.boolean().optional(),
});

// Fee Structures

const FeeStructureModel = z.object({
  id: z.uuid(),
  academicYearId: z.uuid(),
  programmeId: z.uuid(),
  centreId: z.uuid().nullable(),
  items: z.array(
    z.object({
      feeHeadId: z.uuid(),
      feeHeadName: z.string(),
      kind: FeeHeadKindModel,
      amountPaise: Paise,
      frequency: FeeFrequencyModel,
    }),
  ),
  annualPaise: Paise,
});

export const PreschoolFeeStructureModel = FeeStructureModel;

export const PreschoolFeeStructureListResponseModel = z.object({
  academicYear: RefModel,
  centreId: z.uuid().nullable(),
  mayOverride: z.boolean().nullable(),
  items: z.array(
    z.object({
      programmeId: z.uuid(),
      programmeName: z.string(),
      default: FeeStructureModel.nullable(),
      override: FeeStructureModel.nullable(),
      effective: FeeStructureModel.nullable(),
    }),
  ),
});

export const ListPreschoolFeeStructuresRequestModel = z.object({
  /** Defaults to the current Academic Year. */
  academicYearId: z.uuid().optional(),
  /** Adds this Centre's own amounts and `effective`. */
  centreId: z.uuid().optional(),
});

export const SavePreschoolFeeStructureRequestModel = z.object({
  academicYearId: z.uuid(),
  programmeId: z.uuid(),
  /** Null saves the Workspace default (Owner only). */
  centreId: z.uuid().nullable(),
  /** Every line; this replaces what was there. */
  items: z
    .array(
      z.object({
        feeHeadId: z.uuid(),
        amountPaise: Paise,
        frequency: FeeFrequencyModel,
      }),
    )
    .max(50),
});

// A Child's fee account and Invoices

const InvoiceModel = z.object({
  id: z.uuid(),
  admissionId: z.uuid(),
  feeHeadId: z.uuid(),
  feeHeadName: z.string(),
  label: z.string(),
  dueOn: z.iso.date(),
  amountPaise: Paise,
  concessionPaise: Paise,
  concessionReason: z.string().nullable(),
  paidPaise: Paise,
  duePaise: Paise,
  status: InvoiceStatusModel,
});

export const PreschoolInvoiceModel = InvoiceModel;

const FeePaymentSummaryModel = z.object({
  id: z.uuid(),
  receiptNumber: z.string(),
  receivedOn: z.iso.date(),
  amountPaise: Paise,
  method: FeePaymentMethodModel,
  reference: z.string().nullable(),
  /** Cancelled: kept for the record, counts for nothing. */
  cancelled: z.boolean(),
});

export const PreschoolChildFeeAccountResponseModel = z.object({
  child: z.object({
    id: z.uuid(),
    centreId: z.uuid(),
    firstName: z.string(),
    lastName: z.string().nullable(),
    admissionNumber: z.string(),
    status: z.enum(["active", "withdrawn", "graduated"]),
    classroom: RefModel.nullable(),
    programme: RefModel.nullable(),
    academicYear: RefModel.nullable(),
    fatherName: z.string().nullable(),
    fatherPhone: z.string().nullable(),
    motherName: z.string().nullable(),
    motherPhone: z.string().nullable(),
  }),
  invoices: z.array(InvoiceModel),
  payments: z.array(FeePaymentSummaryModel),
  totals: z.object({
    billedPaise: Paise,
    concessionPaise: Paise,
    paidPaise: Paise,
    duePaise: Paise,
    overduePaise: Paise,
  }),
});

export const CreatePreschoolInvoiceRequestModel = z.object({
  childId: z.uuid(),
  feeHeadId: z.uuid(),
  label: z.string().trim().min(1).max(200),
  dueOn: z.iso.date(),
  amountPaise: z.number().int().min(1),
});

export const UpdatePreschoolInvoiceRequestModel = z.object({
  label: z.string().trim().min(1).max(200),
  dueOn: z.iso.date(),
  amountPaise: Paise,
});

export const PreschoolInvoiceConcessionRequestModel = z.object({
  /** Zero removes the concession. */
  concessionPaise: Paise,
  /** Required when the concession is above zero: sibling, staff ward, … */
  reason: z.string().trim().max(200).nullable().optional(),
});

// Fee Payments and Receipts

export const RecordPreschoolFeePaymentRequestModel = z.object({
  childId: z.uuid(),
  amountPaise: z.number().int().min(1),
  method: FeePaymentMethodModel,
  /** Defaults to today in India; never in the future. */
  receivedOn: z.iso.date().optional(),
  reference: z.string().trim().max(100).nullable().optional(),
  note: z.string().trim().max(300).nullable().optional(),
  /** Allocate only across these Invoices of the Child, oldest first. */
  invoiceIds: z.array(z.uuid()).min(1).max(100).optional(),
});

export const ListPreschoolFeePaymentsRequestModel = z.object({
  centreId: z.uuid(),
  from: z.iso.date().optional(),
  to: z.iso.date().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  cursor: z.uuid().optional(),
});

export const PreschoolFeePaymentListResponseModel = z.object({
  items: z.array(
    FeePaymentSummaryModel.extend({
      childId: z.uuid(),
      childName: z.string(),
      admissionNumber: z.string(),
      recordedByName: z.string(),
    }),
  ),
  nextCursor: z.uuid().nullable(),
  total: z.number().int(),
  totalPaise: Paise,
});

export const PreschoolReceiptResponseModel = z.object({
  id: z.uuid(),
  receiptNumber: z.string(),
  receivedOn: z.iso.date(),
  centre: z.object({
    id: z.uuid(),
    name: z.string(),
    addressLine: z.string().nullable(),
    city: z.string().nullable(),
    state: z.string().nullable(),
    pincode: z.string().nullable(),
    phone: z.string().nullable(),
  }),
  child: z.object({
    id: z.uuid(),
    firstName: z.string(),
    lastName: z.string().nullable(),
    admissionNumber: z.string(),
    classroomName: z.string().nullable(),
    fatherName: z.string().nullable(),
    motherName: z.string().nullable(),
  }),
  lines: z.array(
    z.object({ invoiceId: z.uuid(), label: z.string(), amountPaise: Paise }),
  ),
  amountPaise: Paise,
  amountInWords: z.string(),
  method: FeePaymentMethodModel,
  reference: z.string().nullable(),
  note: z.string().nullable(),
  receivedByName: z.string(),
  balanceDuePaise: Paise,
  cancellation: z
    .object({
      cancelledAt: z.iso.datetime(),
      cancelledByName: z.string(),
      reason: z.string(),
    })
    .nullable(),
});

export const CancelPreschoolFeePaymentRequestModel = z.object({
  /** Why: wrong amount, wrong Child, duplicate entry, cheque bounced. */
  reason: z.string().trim().min(1).max(300),
});

// Dues and summary

export const ListPreschoolDuesRequestModel = z.object({
  centreId: z.uuid(),
  classroomId: z.uuid().optional(),
  /** Defaults to `all`. */
  only: z.enum(["overdue", "all"]).optional(),
});

export const PreschoolDuesResponseModel = z.object({
  items: z.array(
    z.object({
      childId: z.uuid(),
      firstName: z.string(),
      lastName: z.string().nullable(),
      admissionNumber: z.string(),
      classroom: RefModel.nullable(),
      fatherName: z.string().nullable(),
      fatherPhone: z.string().nullable(),
      motherName: z.string().nullable(),
      motherPhone: z.string().nullable(),
      duePaise: Paise,
      overduePaise: Paise,
      oldestDueOn: z.iso.date(),
      invoiceCount: z.number().int(),
    }),
  ),
});

export const PreschoolFeeSummaryRequestModel = z.object({
  /** Every Centre the User manages when omitted. */
  centreId: z.uuid().optional(),
});

export const PreschoolFeeSummaryResponseModel = z.object({
  collectedTodayPaise: Paise,
  collectedThisMonthPaise: Paise,
  duePaise: Paise,
  overduePaise: Paise,
  childrenWithDues: z.number().int(),
});
