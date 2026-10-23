import { z } from "zod";

import type {
  EscalationBillDetail,
  EscalationFormOptions,
  EscalationPreview,
} from "@/src/contracts/application/escalation-bill-handlers";
import { quantityText } from "@/src/contracts/domain/boq";
import {
  BILL_STATUSES,
  DEDUCTION_KINDS,
  ESCALATION_COMPONENTS,
} from "@/src/contracts/domain/contract-terms";
import {
  ESCALATION_BASES,
  ESCALATION_DEDUCTION_KINDS,
  indexText,
  type EscalationWorking,
} from "@/src/contracts/domain/escalation";
import {
  fixedDecimal,
  PERCENT_SCALE,
} from "@/src/contracts/domain/item-analysis";
import {
  BILL_DEDUCTION_DESCRIPTION_MAX,
  BILL_DEDUCTIONS_MAX,
  BILL_REMARKS_MAX,
} from "@/src/contracts/domain/ra-bill";
import { FLAGS } from "@/src/shared-kernel/access";

export const ESCALATION_BILLS_PATH =
  "/api/construction/contracts/escalation-bills";

const optionalExpected = z.iso
  .datetime()
  .optional()
  .describe(
    "The bill's `updatedAt` as loaded; when sent, a stale one is refused with 409 BILL_CHANGED.",
  );
const reason = (code: string) =>
  z
    .string()
    .max(2000)
    .describe(`Required, at most 500 characters (400 ${code}).`);
const month = (description: string) =>
  z.string().max(30).describe(`YYYY-MM. ${description}`);
const money = (description: string) =>
  z
    .int()
    .nullable()
    .describe(`${description} Null without the side's Financial.`);

// ---------------------------------------------------------------------------
// Requests
// ---------------------------------------------------------------------------

export const ConstructionContractsEscalationBillParamsModel = z.object({
  id: z.uuid(),
});

const DeductionInput = z.object({
  kind: z
    .enum(ESCALATION_DEDUCTION_KINDS)
    .describe(
      "Retention or other; advances are recovered on running bills (400 BILL_DEDUCTION_KIND_INVALID).",
    ),
  amount: z.int().describe("Paise, more than 0."),
  description: z
    .string()
    .max(2000)
    .nullable()
    .optional()
    .describe(
      `At most ${String(BILL_DEDUCTION_DESCRIPTION_MAX)} characters; required for "other".`,
    ),
});

const QuantityInput = z.object({
  component: z.enum(ESCALATION_COMPONENTS),
  quantity: z
    .union([z.string().max(30), z.number()])
    .describe(
      "Used in the period, 0 or more with four places, for a 10CA (quantity) component of the clause (400 ESCALATION_QUANTITY_INVALID).",
    ),
});

const content = {
  billDate: z
    .string()
    .max(30)
    .describe(
      "YYYY-MM-DD: not after today, not before the Work Order's date (400 BILL_DATE_IN_FUTURE, BILL_DATE_BEFORE_ORDER_DATE).",
    ),
  fromMonth: month(
    "After the clause's base month (400 ESCALATION_PERIOD_BEFORE_BASE).",
  ),
  toMonth: month(
    "Whole months; at most 12; ending by the bill date (400 ESCALATION_PERIOD_INVALID, ESCALATION_PERIOD_TOO_LONG, ESCALATION_PERIOD_AFTER_BILL_DATE).",
  ),
  remarks: z
    .string()
    .max(20_000)
    .nullable()
    .optional()
    .describe(
      `At most ${BILL_REMARKS_MAX.toLocaleString("en-IN")} characters.`,
    ),
  quantities: z.array(QuantityInput).max(10).nullable().optional(),
  deductions: z
    .array(DeductionInput)
    .max(BILL_DEDUCTIONS_MAX * 5)
    .nullable()
    .optional()
    .describe(
      "Ignored without Financial. Left out: kept (a new draft holds the suggested retention).",
    ),
};

export const CreateConstructionContractsEscalationBillRequestModel = z.object({
  projectId: z.uuid(),
  workOrderId: z
    .uuid()
    .nullable()
    .optional()
    .describe(
      "Contractor side: an issued or closed Work Order of the Project with an escalation clause; none means the client contract (400 ESCALATION_CLAUSE_REQUIRED).",
    ),
  ...content,
});

export const UpdateConstructionContractsEscalationBillRequestModel = z.object({
  billDate: content.billDate.optional(),
  fromMonth: content.fromMonth.optional(),
  toMonth: content.toMonth.optional(),
  remarks: content.remarks,
  quantities: content.quantities,
  deductions: content.deductions,
  expectedUpdatedAt: optionalExpected,
});

export const ConstructionContractsEscalationBillStepRequestModel = z.object({
  expectedUpdatedAt: optionalExpected,
});

export const RejectConstructionContractsEscalationBillRequestModel = z.object({
  reason: reason("REJECTION_REASON_REQUIRED"),
  expectedUpdatedAt: optionalExpected,
});

export const ReverseConstructionContractsEscalationBillRequestModel = z.object({
  reason: reason("REVERSE_REASON_REQUIRED"),
  expectedUpdatedAt: optionalExpected,
});

export const PreviewConstructionContractsEscalationBillRequestModel = z.object({
  projectId: z.uuid(),
  workOrderId: z.uuid().optional(),
  billDate: z.string().max(30).optional().describe("Default: today."),
  fromMonth: content.fromMonth,
  toMonth: content.toMonth,
});

export const ConstructionContractsEscalationFormOptionsRequestModel = z.object({
  projectId: z.uuid(),
  side: z.enum(["contractor", "client"]),
});

// ---------------------------------------------------------------------------
// Responses
// ---------------------------------------------------------------------------

export const ConstructionContractsEscalationWorkingModel = z.object({
  valueOfWork: money("R, paise: Σ gross of the bills taken."),
  bills: z
    .array(
      z.object({
        id: z.uuid(),
        number: z.string().nullable(),
        billDate: z.string(),
        gross: money("Paise."),
      }),
    )
    .describe(
      "The approved, unreversed running bills of the side dated in the period.",
    ),
  quantityValue: money(
    "Paise: Σ quantity × base price of the 10CA components.",
  ),
  escalableValue: money(
    "Paise: R less the 10CA materials' value, what 10CC applies to.",
  ),
  nonEscalablePercent: z.string().nullable(),
  baseMonth: z.string(),
  months: z.array(z.string()),
  components: z.array(
    z.object({
      component: z.enum(ESCALATION_COMPONENTS),
      basis: z.enum(ESCALATION_BASES),
      weightPercent: z.string().nullable(),
      series: z.string(),
      baseIndex: z.string().describe("I₀, four places."),
      indices: z.array(z.object({ month: z.string(), value: z.string() })),
      averageIndex: z
        .string()
        .describe(
          "Ī for display, four places; the amount uses the exact average.",
        ),
      factor: z.string().describe("(Ī − I₀) / I₀, six places."),
      quantity: z.string().nullable(),
      basePrice: money("Paise per unit (10CA)."),
      amount: money("Paise, rounded half away from zero."),
    }),
  ),
  gross: money("Paise: Σ component amounts; negative when the indices fell."),
});

export const PreviewConstructionContractsEscalationBillResponseModel = z.object(
  {
    periodFrom: z.string(),
    periodTo: z.string(),
    working: ConstructionContractsEscalationWorkingModel,
  },
);
export type PreviewConstructionContractsEscalationBillResponseModel = z.infer<
  typeof PreviewConstructionContractsEscalationBillResponseModel
>;

export const ConstructionContractsEscalationFormOptionsResponseModel = z.object(
  {
    side: z.enum(["contractor", "client"]),
    workOrders: z.array(
      z.object({
        id: z.uuid(),
        number: z.string().nullable(),
        contractorName: z.string(),
        baseMonth: z.string().nullable().describe("Null: no clause yet."),
        quantityComponents: z.array(z.enum(ESCALATION_COMPONENTS)),
      }),
    ),
    clientClause: z
      .object({
        baseMonth: z.string(),
        quantityComponents: z.array(z.enum(ESCALATION_COMPONENTS)),
      })
      .nullable(),
    today: z.string(),
  },
);
export type ConstructionContractsEscalationFormOptionsResponseModel = z.infer<
  typeof ConstructionContractsEscalationFormOptionsResponseModel
>;

export const GetConstructionContractsEscalationBillResponseModel = z.object({
  id: z.uuid(),
  projectId: z.uuid(),
  projectName: z.string(),
  side: z.enum(["contractor", "client"]),
  type: z.literal("escalation"),
  workOrder: z
    .object({
      id: z.uuid(),
      number: z.string().nullable(),
      orderDate: z.string(),
    })
    .nullable(),
  partyId: z.string(),
  partyName: z.string(),
  number: z.string().nullable(),
  ordinal: z
    .int()
    .nullable()
    .describe("Escalation bill 1, 2, … on the contract."),
  billDate: z.string(),
  periodFrom: z.string(),
  periodTo: z.string(),
  status: z.enum(BILL_STATUSES),
  working: ConstructionContractsEscalationWorkingModel,
  gross: money("Paise: the escalation."),
  sacCode: z.string().nullable(),
  gstRate: z.string().nullable(),
  supplyType: z.enum(["intra_state", "inter_state"]),
  placeOfSupplyStateCode: z.string().nullable(),
  supplierGstin: z.string().nullable(),
  recipientGstin: z.string().nullable(),
  reverseCharge: z.boolean(),
  cgst: money("Paise."),
  sgst: money("Paise."),
  igst: money("Paise."),
  gst: money("Paise."),
  payableGst: money("Paise: 0 under reverse charge."),
  deductionLines: z.array(
    z.object({
      id: z.uuid(),
      kind: z.enum(DEDUCTION_KINDS),
      description: z.string().nullable(),
      amount: money("Paise."),
    }),
  ),
  deductions: money("Paise."),
  net: money("Paise: gross + GST payable − deductions."),
  retention: z.object({
    percent: z.string(),
    capPercent: z.string().nullable(),
    byPercent: money("Paise."),
    cap: money("Paise."),
    heldBefore: money(
      "Paise held on the contract's other approved bills, both types.",
    ),
    suggested: money("Paise: the most this bill may hold."),
  }),
  recovery: z
    .object({
      amount: money("Paise to recover."),
      recovered: money("Paise recovered on approved running bills."),
      outstanding: money("Paise left."),
    })
    .nullable()
    .describe(
      "A negative approved bill: recovered on the next running bills as an `other` deduction naming it.",
    ),
  invoiceId: z.uuid().nullable(),
  warnings: z.array(z.object({ code: z.string(), message: z.string() })),
  remarks: z.string().nullable(),
  rejectReason: z.string().nullable(),
  reverseReason: z.string().nullable(),
  submittedAt: z.iso.datetime().nullable(),
  submittedByName: z.string().nullable(),
  decidedAt: z.iso.datetime().nullable(),
  decidedByName: z.string().nullable(),
  reversedAt: z.iso.datetime().nullable(),
  reversedByName: z.string().nullable(),
  createdBy: z.string(),
  createdByName: z.string().nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  allowed: z.object({
    edit: z.boolean(),
    refresh: z.boolean(),
    delete: z.boolean(),
    submit: z.boolean(),
    approve: z.boolean(),
    reject: z.boolean(),
    reverse: z.boolean(),
    print: z.boolean(),
  }),
  financial: z.boolean(),
  viewerFlags: z.array(z.enum(FLAGS)),
});
export type GetConstructionContractsEscalationBillResponseModel = z.infer<
  typeof GetConstructionContractsEscalationBillResponseModel
>;

// ---------------------------------------------------------------------------
// Mapping
// ---------------------------------------------------------------------------

const pct = (value: bigint) => fixedDecimal(value, PERCENT_SCALE);

export function toWorkingResponse(
  working: EscalationWorking,
  financial: boolean,
): z.infer<typeof ConstructionContractsEscalationWorkingModel> {
  const paise = (value: bigint | null) =>
    financial && value != null ? Number(value) : null;
  return {
    valueOfWork: paise(working.valueOfWork),
    bills: working.bills.map((bill) => ({
      id: bill.id,
      number: bill.number,
      billDate: bill.billDate,
      gross: paise(bill.gross),
    })),
    quantityValue: paise(working.quantityValue),
    escalableValue: paise(working.escalableValue),
    nonEscalablePercent: financial ? pct(working.nonEscalablePercent) : null,
    baseMonth: working.baseMonth,
    months: working.months,
    components: working.components.map((row) => ({
      component: row.component,
      basis: row.basis,
      weightPercent:
        financial && row.weightPercent != null ? pct(row.weightPercent) : null,
      series: row.series,
      baseIndex: indexText(row.baseIndex),
      indices: row.indices.map((item) => ({
        month: item.month,
        value: indexText(item.value),
      })),
      averageIndex: indexText(row.averageIndex),
      factor: row.factor,
      quantity: row.quantity == null ? null : quantityText(row.quantity),
      basePrice: paise(row.basePrice),
      amount: paise(row.amount),
    })),
    gross: paise(working.gross),
  };
}

export function toPreviewResponse(
  preview: EscalationPreview,
  financial: boolean,
): PreviewConstructionContractsEscalationBillResponseModel {
  return {
    periodFrom: preview.period.from,
    periodTo: preview.period.to,
    working: toWorkingResponse(preview.working, financial),
  };
}

export function toEscalationFormOptionsResponse(
  options: EscalationFormOptions,
): ConstructionContractsEscalationFormOptionsResponseModel {
  return options;
}

export function toEscalationBillResponse(
  detail: EscalationBillDetail,
): GetConstructionContractsEscalationBillResponseModel {
  const { bill, financial } = detail;
  const paise = (value: bigint | null) =>
    financial && value != null ? Number(value) : null;
  return {
    id: bill.id,
    projectId: bill.projectId,
    projectName: detail.projectName,
    side: bill.side,
    type: "escalation",
    workOrder: detail.workOrder,
    partyId: detail.partyId,
    partyName: detail.partyName,
    number: bill.number,
    ordinal: bill.ordinal,
    billDate: bill.billDate,
    periodFrom: bill.periodFrom,
    periodTo: bill.periodTo,
    status: bill.status,
    working: toWorkingResponse(bill.working, financial),
    gross: paise(bill.gross),
    sacCode: bill.sacCode,
    gstRate: bill.gstRate == null ? null : pct(bill.gstRate),
    supplyType: detail.supplyType,
    placeOfSupplyStateCode: bill.placeOfSupplyStateCode,
    supplierGstin: bill.supplierGstin,
    recipientGstin: bill.recipientGstin,
    reverseCharge: bill.reverseCharge,
    cgst: paise(bill.cgst),
    sgst: paise(bill.sgst),
    igst: paise(bill.igst),
    gst: paise(bill.cgst + bill.sgst + bill.igst),
    payableGst: paise(detail.payableGst),
    deductionLines: detail.deductions.map((row) => ({
      id: row.id,
      kind: row.kind,
      description: row.description,
      amount: paise(row.amount),
    })),
    deductions: paise(bill.deductionsTotal),
    net: paise(bill.net),
    retention: {
      percent: pct(detail.retentionPercent),
      capPercent:
        detail.retentionCapPercent == null
          ? null
          : pct(detail.retentionCapPercent),
      byPercent: paise(detail.retention.byPercent),
      cap: paise(detail.retention.cap),
      heldBefore: paise(detail.retention.heldBefore),
      suggested: paise(detail.retention.suggested),
    },
    recovery:
      detail.recovery == null
        ? null
        : {
            amount: paise(detail.recovery.amount),
            recovered: paise(detail.recovery.recovered),
            outstanding: paise(detail.recovery.outstanding),
          },
    invoiceId: bill.invoiceId,
    warnings: detail.warnings,
    remarks: bill.remarks,
    rejectReason: bill.rejectReason,
    reverseReason: bill.reverseReason,
    submittedAt: bill.submittedAt?.toISOString() ?? null,
    submittedByName: detail.submittedByName,
    decidedAt: bill.decidedAt?.toISOString() ?? null,
    decidedByName: detail.decidedByName,
    reversedAt: bill.reversedAt?.toISOString() ?? null,
    reversedByName: detail.reversedByName,
    createdBy: bill.createdBy,
    createdByName: detail.createdByName,
    createdAt: bill.createdAt.toISOString(),
    updatedAt: bill.updatedAt.toISOString(),
    allowed: detail.allowed,
    financial,
    viewerFlags: detail.viewerFlags,
  };
}
