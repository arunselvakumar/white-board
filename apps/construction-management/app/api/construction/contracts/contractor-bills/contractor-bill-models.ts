import { z } from "zod";

import type {
  ContractorBillDetail,
  ContractorBillFormOptions,
  ContractorBillView,
} from "@/src/contracts/application/contractor-bill-handlers";
import type {
  BillCursor,
  BillTotals,
} from "@/src/contracts/application/contractor-bill-ports";
import { quantityText } from "@/src/contracts/domain/boq";
import {
  BILL_STATUSES,
  DEDUCTION_KINDS,
  TDS_NATURES,
  WORK_ORDER_STATUSES,
} from "@/src/contracts/domain/contract-terms";
import {
  BILL_DEDUCTION_DESCRIPTION_MAX,
  BILL_DEDUCTIONS_MAX,
  BILL_REMARKS_MAX,
  CONTRACTOR_BILL_DEDUCTION_KINDS,
  TDS_ESTIMATE_NOTE,
  type RetentionSuggestion,
} from "@/src/contracts/domain/contractor-bill";
import {
  fixedDecimal,
  PERCENT_SCALE,
} from "@/src/contracts/domain/item-analysis";
import { FLAGS } from "@/src/shared-kernel/access";
import {
  decodeListCursor,
  encodeListCursor,
} from "@/src/shared-kernel/list-cursor";

import { ConstructionContractsMeasurementLocationModel } from "../measurements/measurement-models";
import {
  billDeductionMaterialId,
  ConstructionContractsBillMaterialModel,
  toBillMaterialsResponse,
} from "./bill-material-models";

import {
  billDeductionEscalationBillId,
  billPeriodFields,
  billTypeField,
  billTypeFilter,
  ConstructionContractsBillEscalationRecoveryModel,
  toBillEscalationRecoveriesResponse,
} from "../escalation-bills/bill-escalation-models";
import {
  billDeductionAdvanceId,
  ConstructionContractsBillAdvanceModel,
  toBillAdvancesResponse,
} from "../advances/bill-advance-models";

export const CONTRACTOR_BILLS_PATH =
  "/api/construction/contracts/contractor-bills";

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
const date = (description: string) =>
  z.string().max(30).describe(`YYYY-MM-DD. ${description}`);

// ---------------------------------------------------------------------------
// Requests
// ---------------------------------------------------------------------------

export const ConstructionContractsContractorBillParamsModel = z.object({
  id: z.uuid(),
});

export const ConstructionContractsContractorBillProjectQueryModel = z.object({
  projectId: z.uuid(),
});

export const ListConstructionContractsContractorBillsRequestModel = z
  .object({
    projectId: z.uuid(),
    status: z.enum(BILL_STATUSES).optional(),
    type: billTypeFilter,
    workOrderId: z.uuid().optional(),
    contractorId: z.uuid().optional(),
    from: z.iso.date().optional().describe("Bill date on or after."),
    to: z.iso.date().optional().describe("Bill date on or before."),
    limit: z.coerce.number().int().min(1).max(100).optional().default(25),
    after: z.string().min(1).max(500).optional(),
    before: z.string().min(1).max(500).optional(),
  })
  .refine((value) => value.after == null || value.before == null, {
    message: "after and before are mutually exclusive.",
    path: ["after"],
  });

export const ConstructionContractsContractorBillDeductionInputModel = z.object({
  kind: z
    .enum(CONTRACTOR_BILL_DEDUCTION_KINDS)
    .describe("Material reconciliation recovery names its Material (CM-1110)."),
  amount: z
    .int()
    .describe(
      "Paise, more than 0. Retention is at most the suggestion (400 BILL_RETENTION_OVER_CAP); all deductions at most gross + GST payable (400 BILL_DEDUCTIONS_TOO_LARGE).",
    ),
  description: z
    .string()
    .max(2000)
    .nullable()
    .optional()
    .describe(
      `At most ${String(BILL_DEDUCTION_DESCRIPTION_MAX)} characters; the reason, required for "other" (400 BILL_DEDUCTION_REASON_REQUIRED).`,
    ),
  advanceId: billDeductionAdvanceId,
  escalationBillId: billDeductionEscalationBillId,
  materialId: billDeductionMaterialId,
});

const content = {
  billDate: date(
    "Not after today and not before the Work Order's date (400 BILL_DATE_IN_FUTURE, BILL_DATE_BEFORE_ORDER_DATE).",
  ),
  measuredUpTo: date(
    "Checked rows measured on or before this date are taken; not after the bill date (400 MEASURED_UP_TO_AFTER_BILL_DATE).",
  ),
  remarks: z
    .string()
    .max(20_000)
    .nullable()
    .optional()
    .describe(
      `At most ${BILL_REMARKS_MAX.toLocaleString("en-IN")} characters; line breaks kept.`,
    ),
  isFinal: z
    .boolean()
    .nullable()
    .optional()
    .describe("A Final bill closes the Work Order when approved."),
  deductions: z
    .array(ConstructionContractsContractorBillDeductionInputModel)
    .max(BILL_DEDUCTIONS_MAX * 5)
    .nullable()
    .optional()
    .describe(
      `At most ${String(BILL_DEDUCTIONS_MAX)}. Ignored without Contractor Bill Financial. Left out: kept (a new draft holds the suggested retention).`,
    ),
};

export const CreateConstructionContractsContractorBillRequestModel = z.object({
  projectId: z.uuid(),
  workOrderId: z
    .uuid()
    .describe(
      "An issued Work Order of the Project (400 BILL_WORK_ORDER_INVALID). One draft or pending bill at a time (409 BILL_OPEN_EXISTS).",
    ),
  ...content,
});
export type CreateConstructionContractsContractorBillRequestModel = z.input<
  typeof CreateConstructionContractsContractorBillRequestModel
>;

export const UpdateConstructionContractsContractorBillRequestModel = z.object({
  ...content,
  expectedUpdatedAt: z.iso
    .datetime()
    .describe("The bill's `updatedAt` as loaded (409 BILL_CHANGED)."),
});
export type UpdateConstructionContractsContractorBillRequestModel = z.input<
  typeof UpdateConstructionContractsContractorBillRequestModel
>;

export const RefreshConstructionContractsContractorBillRequestModel = z.object({
  measuredUpTo: date("Left out: the bill's own. Takes the rows checked since.")
    .nullable()
    .optional(),
  expectedUpdatedAt: optionalExpected,
});

export const ConstructionContractsContractorBillStepRequestModel = z.object({
  expectedUpdatedAt: optionalExpected,
});

export const ApproveConstructionContractsContractorBillRequestModel = z.object({
  confirmUnbilled: z
    .boolean()
    .optional()
    .describe(
      "A Final bill that leaves Work Order lines short is refused (409 BILL_FINAL_UNBILLED, `details.lines`) unless this is true.",
    ),
  expectedUpdatedAt: optionalExpected,
});

export const RejectConstructionContractsContractorBillRequestModel = z.object({
  reason: reason("REJECTION_REASON_REQUIRED"),
  expectedUpdatedAt: optionalExpected,
});

export const ReverseConstructionContractsContractorBillRequestModel = z.object({
  reason: reason("REVERSE_REASON_REQUIRED"),
  expectedUpdatedAt: optionalExpected,
});

// ---------------------------------------------------------------------------
// Responses
// ---------------------------------------------------------------------------

const money = (description: string) =>
  z
    .int()
    .nullable()
    .describe(`${description} Null without Contractor Bill Financial.`);

const quantity = (description: string) =>
  z.string().describe(`${description} Four places ("12.5000").`);

const percentText = z.string().describe('Two places ("5.00").');

const summary = {
  id: z.uuid(),
  projectId: z.uuid(),
  workOrderId: z.uuid(),
  workOrderNumber: z.string().nullable(),
  contractorId: z.uuid(),
  contractorName: z.string(),
  departmentName: z.string().nullable(),
  number: z
    .string()
    .nullable()
    .describe("Null on a draft never submitted (screens show “Draft”)."),
  ordinal: z
    .int()
    .nullable()
    .describe("RA bill 1, 2, … on the Work Order; set at submit."),
  billDate: z.string(),
  measuredUpTo: z.string(),
  isFinal: z.boolean(),
  status: z.enum(BILL_STATUSES),
  type: billTypeField,
  ...billPeriodFields,
  gross: money("Paise: cumulative value − previous value."),
  gst: money("Paise: CGST + SGST + IGST."),
  reverseCharge: z.boolean(),
  deductions: money("Paise."),
  net: money("Paise: gross + GST payable − deductions."),
  invoiceId: z
    .uuid()
    .nullable()
    .describe("The payable invoice in finance, once approved."),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso
    .datetime()
    .describe("Send it back as `expectedUpdatedAt` when you change it."),
};

export const ConstructionContractsContractorBillSummaryModel =
  z.object(summary);
export type ConstructionContractsContractorBillSummaryModel = z.infer<
  typeof ConstructionContractsContractorBillSummaryModel
>;

export const ConstructionContractsContractorBillTotalsModel = z.object({
  count: z.int().nonnegative(),
  gross: money("Paise."),
  gst: money("Paise."),
  deductions: money("Paise."),
  net: money("Paise."),
});

export const ListConstructionContractsContractorBillsResponseModel = z.object({
  items: z.array(ConstructionContractsContractorBillSummaryModel),
  nextCursor: z.string().nullable(),
  prevCursor: z.string().nullable(),
  total: z.int().nonnegative(),
  totals: ConstructionContractsContractorBillTotalsModel.describe(
    "Over the bills the filter matches that count: draft, pending and approved (not rejected or reversed).",
  ),
  retentionHeld: z
    .array(
      z.object({
        contractorId: z.uuid(),
        contractorName: z.string(),
        amount: money("Paise held on approved bills, not yet released."),
      }),
    )
    .describe(
      "Retention held per Contractor on the Project (Financial only; empty without it).",
    ),
  financial: z.boolean(),
  viewerFlags: z
    .array(z.enum(FLAGS))
    .describe("The Contractor Bill flags the caller holds on the Project."),
});
export type ListConstructionContractsContractorBillsResponseModel = z.infer<
  typeof ListConstructionContractsContractorBillsResponseModel
>;

export const ConstructionContractsContractorBillRowModel = z.object({
  id: z.uuid(),
  sheetId: z.uuid(),
  measuredOn: z.string(),
  sheetTitle: z.string().nullable(),
  description: z.string().nullable(),
  location: ConstructionContractsMeasurementLocationModel.nullable(),
  locationLabel: z.string().nullable(),
  nos: quantity("Blank on a direct row.").nullable(),
  length: quantity("").nullable(),
  breadth: quantity("").nullable(),
  depth: quantity("").nullable(),
  direct: z.boolean(),
  quantity: quantity("Negative for a deduction."),
});

export const ConstructionContractsContractorBillLineModel = z.object({
  id: z.uuid(),
  workOrderLineId: z.uuid(),
  itemNo: z.string().nullable(),
  description: z.string(),
  uomId: z.uuid(),
  uomName: z.string(),
  rate: money(
    "Paise per UoM: the Work Order line's rate when the bill was drafted or refreshed.",
  ),
  previousQuantity: quantity("On earlier approved bills."),
  quantity: quantity("This bill: Σ its rows."),
  cumulativeQuantity: quantity("Previous + this."),
  workOrderQuantity: quantity("The Work Order line's quantity now.").nullable(),
  amount: money("Paise: round(cumulative × rate) − round(previous × rate)."),
  rows: z.array(ConstructionContractsContractorBillRowModel),
});

export const ConstructionContractsContractorBillDeductionModel = z.object({
  id: z.uuid(),
  kind: z.enum(DEDUCTION_KINDS),
  description: z.string().nullable(),
  amount: money("Paise."),
  advanceId: z.uuid().nullable().describe("A recovery's advance (CM-1108)."),
  escalationBillId: z
    .uuid()
    .nullable()
    .describe(
      "The negative escalation bill an `other` deduction recovers (CM-1109).",
    ),
  materialId: z
    .uuid()
    .nullable()
    .describe("The Material a material deduction recovers (CM-1110)."),
});

export const ConstructionContractsContractorBillRetentionModel = z.object({
  percent: percentText.describe("The Work Order's retention % per bill."),
  capPercent: percentText
    .nullable()
    .describe("The cap as a % of the Work Order's value."),
  byPercent: money("Paise: gross × retention %."),
  cap: money("Paise: cap % × the Work Order's value."),
  heldBefore: money("Paise held on the Work Order's other approved bills."),
  suggested: money("Paise: what this bill may hold, at most."),
});

export const ConstructionContractsContractorBillTdsEstimateModel = z.object({
  label: z.string(),
  rate: percentText,
  applicable: z.boolean(),
  base: money("Paise: the gross."),
  amount: money("Paise, rounded to the rupee."),
  note: z.string(),
});

export const ConstructionContractsContractorBillAllowedModel = z.object({
  edit: z.boolean(),
  refresh: z.boolean(),
  delete: z.boolean(),
  submit: z.boolean(),
  approve: z.boolean(),
  reject: z.boolean(),
  reverse: z.boolean(),
  print: z.boolean(),
});

export const GetConstructionContractsContractorBillResponseModel = z.object({
  ...summary,
  projectName: z.string(),
  workOrder: z.object({
    id: z.uuid(),
    number: z.string().nullable(),
    status: z.enum(WORK_ORDER_STATUSES),
    orderDate: z.string(),
    tdsNature: z.enum(TDS_NATURES).nullable(),
    mobilisationRecoveryPercent: percentText.nullable(),
  }),
  cumulativeValue: money("Paise: Σ round(cumulative × rate)."),
  previousValue: money("Paise: Σ round(previous × rate)."),
  sacCode: z.string().nullable(),
  gstRate: percentText.nullable(),
  supplyType: z.enum(["intra_state", "inter_state"]),
  placeOfSupplyStateCode: z.string().nullable(),
  supplierGstin: z.string().nullable(),
  cgst: money("Paise."),
  sgst: money("Paise."),
  igst: money("Paise."),
  payableGst: money(
    "Paise: the GST paid to the Contractor (0 under reverse charge).",
  ),
  lines: z.array(ConstructionContractsContractorBillLineModel),
  deductionLines: z.array(ConstructionContractsContractorBillDeductionModel),
  escalationRecoveries: z
    .array(ConstructionContractsBillEscalationRecoveryModel)
    .describe(
      "Approved negative escalation bills of the contract still to recover on running bills (CM-1109).",
    ),
  advances: z
    .array(ConstructionContractsBillAdvanceModel)
    .describe(
      "The contract's advances this bill may recover, with what is left and what its gross suggests (CM-1108).",
    ),
  materials: z
    .array(ConstructionContractsBillMaterialModel)
    .describe(
      "The Work Order's materials reconciled at this bill, with the recoveries it suggests (CM-1110).",
    ),
  retention: ConstructionContractsContractorBillRetentionModel,
  retentionHeldOnWorkOrder: money(
    "Paise: retention held on the Work Order: its approved bills' retention less releases (CM-1108).",
  ),
  tdsEstimate:
    ConstructionContractsContractorBillTdsEstimateModel.nullable().describe(
      "For information: finance deducts TDS at payment. Null without Financial.",
    ),
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
  allowed: ConstructionContractsContractorBillAllowedModel,
  financial: z.boolean(),
  viewerFlags: z.array(z.enum(FLAGS)),
});
export type GetConstructionContractsContractorBillResponseModel = z.infer<
  typeof GetConstructionContractsContractorBillResponseModel
>;

export const ConstructionContractsContractorBillSuggestionsResponseModel =
  z.object({
    retention: ConstructionContractsContractorBillRetentionModel,
    mobilisationRecovery: money(
      "Paise: Σ the suggested mobilisation advance recoveries; null when there is none.",
    ),
    recoveries: z
      .array(ConstructionContractsBillAdvanceModel)
      .describe(
        "One per advance of the contract with what this bill suggests recovering (CM-1108).",
      ),
    materials: z
      .array(ConstructionContractsBillMaterialModel)
      .describe(
        "Per Work Order material: the material reconciliation recovery and material at cost this bill suggests (CM-1110).",
      ),
  });
export type ConstructionContractsContractorBillSuggestionsResponseModel =
  z.infer<typeof ConstructionContractsContractorBillSuggestionsResponseModel>;

export const ConstructionContractsContractorBillFormOptionsResponseModel =
  z.object({
    workOrders: z.array(
      z.object({
        id: z.uuid(),
        number: z.string().nullable(),
        orderDate: z.string(),
        contractorId: z.uuid(),
        contractorName: z.string(),
        unbilled: z
          .array(
            z.object({ measuredOn: z.string(), rows: z.int().nonnegative() }),
          )
          .describe("Checked rows waiting to be billed, per date measured."),
        openBillId: z
          .uuid()
          .nullable()
          .describe("A draft or pending bill already on it."),
      }),
    ),
    today: z.string(),
  });
export type ConstructionContractsContractorBillFormOptionsResponseModel =
  z.infer<typeof ConstructionContractsContractorBillFormOptionsResponseModel>;

// ---------------------------------------------------------------------------
// Mapping
// ---------------------------------------------------------------------------

const paise = (value: bigint | null, financial: boolean): number | null =>
  financial && value != null ? Number(value) : null;

const percent = (value: bigint) => fixedDecimal(value, PERCENT_SCALE);

const optionalQuantity = (value: bigint | null) =>
  value == null ? null : quantityText(value);

function summaryOf(view: ContractorBillView, financial: boolean) {
  return {
    id: view.id,
    projectId: view.projectId,
    workOrderId: view.workOrderId,
    workOrderNumber: view.workOrderNumber,
    contractorId: view.contractorId,
    contractorName: view.contractorName,
    departmentName: view.departmentName,
    number: view.number,
    ordinal: view.ordinal,
    type: view.type,
    periodFrom: view.periodFrom,
    periodTo: view.periodTo,
    billDate: view.billDate,
    measuredUpTo: view.measuredUpTo,
    isFinal: view.isFinal,
    status: view.status,
    gross: paise(view.gross, financial),
    gst: paise(view.gstTotal, financial),
    reverseCharge: view.reverseCharge,
    deductions: paise(view.deductionsTotal, financial),
    net: paise(view.net, financial),
    invoiceId: view.invoiceId,
    createdAt: view.createdAt.toISOString(),
    updatedAt: view.updatedAt.toISOString(),
  };
}

export function toContractorBillSummaryResponse(
  view: ContractorBillView,
  financial: boolean,
): ConstructionContractsContractorBillSummaryModel {
  return summaryOf(view, financial);
}

export function toTotalsResponse(totals: BillTotals, financial: boolean) {
  return {
    count: totals.count,
    gross: paise(totals.gross, financial),
    gst: paise(totals.gst, financial),
    deductions: paise(totals.deductions, financial),
    net: paise(totals.net, financial),
  };
}

export function toRetentionResponse(
  retention: RetentionSuggestion,
  terms: { percent: bigint; capPercent: bigint | null },
  financial: boolean,
) {
  return {
    percent: percent(terms.percent),
    capPercent: terms.capPercent == null ? null : percent(terms.capPercent),
    byPercent: paise(retention.byPercent, financial),
    cap: paise(retention.cap, financial),
    heldBefore: paise(retention.heldBefore, financial),
    suggested: paise(retention.suggested, financial),
  };
}

export function toContractorBillResponse(
  detail: ContractorBillDetail,
): GetConstructionContractsContractorBillResponseModel {
  const { bill, financial, workOrder } = detail;
  return {
    ...summaryOf(bill, financial),
    projectName: detail.projectName,
    workOrder: {
      id: workOrder.id,
      number: workOrder.number,
      status: workOrder.status,
      orderDate: workOrder.orderDate,
      tdsNature: workOrder.tdsNature as (typeof TDS_NATURES)[number] | null,
      mobilisationRecoveryPercent:
        workOrder.mobilisationRecoveryPercent == null
          ? null
          : percent(workOrder.mobilisationRecoveryPercent),
    },
    cumulativeValue: paise(bill.cumulativeValue, financial),
    previousValue: paise(bill.previousValue, financial),
    sacCode: bill.sacCode,
    gstRate: bill.gstRate == null ? null : percent(bill.gstRate),
    supplyType: detail.supplyType,
    placeOfSupplyStateCode: bill.placeOfSupplyStateCode,
    supplierGstin: bill.supplierGstin,
    cgst: paise(bill.cgst, financial),
    sgst: paise(bill.sgst, financial),
    igst: paise(bill.igst, financial),
    payableGst: paise(detail.payableGst, financial),
    lines: detail.lines.map((line) => ({
      id: line.id,
      workOrderLineId: line.workOrderLineId,
      itemNo: line.itemNo,
      description: line.description,
      uomId: line.uomId,
      uomName: line.uomName,
      rate: paise(line.rate, financial),
      previousQuantity: quantityText(line.previousQuantity),
      quantity: quantityText(line.quantity),
      cumulativeQuantity: quantityText(line.cumulativeQuantity),
      workOrderQuantity: optionalQuantity(line.workOrderQuantity),
      amount: paise(line.amount, financial),
      rows: line.rows.map((row) => ({
        id: row.id,
        sheetId: row.sheetId,
        measuredOn: row.measuredOn,
        sheetTitle: row.sheetTitle,
        description: row.description,
        location: row.location as z.infer<
          typeof ConstructionContractsMeasurementLocationModel
        > | null,
        locationLabel: row.locationLabel,
        nos: optionalQuantity(row.nos),
        length: optionalQuantity(row.length),
        breadth: optionalQuantity(row.breadth),
        depth: optionalQuantity(row.depth),
        direct: row.direct,
        quantity: quantityText(row.quantity),
      })),
    })),
    deductionLines: detail.deductions.map((deduction) => ({
      id: deduction.id,
      kind: deduction.kind,
      description: deduction.description,
      amount: paise(deduction.amount, financial),
      advanceId: deduction.advanceId,
      escalationBillId: deduction.escalationBillId,
      materialId: deduction.materialId,
    })),
    advances: toBillAdvancesResponse(detail.advances, financial),
    materials: toBillMaterialsResponse(detail.materials, financial),
    escalationRecoveries: toBillEscalationRecoveriesResponse(
      detail.escalationRecoveries,
      financial,
    ),
    retention: toRetentionResponse(
      detail.retention,
      {
        percent: workOrder.retentionPercent,
        capPercent: workOrder.retentionCapPercent,
      },
      financial,
    ),
    retentionHeldOnWorkOrder: paise(detail.retentionHeldOnWorkOrder, financial),
    tdsEstimate:
      detail.tdsEstimate == null || !financial
        ? null
        : {
            label: detail.tdsEstimate.label,
            rate: detail.tdsEstimate.rate,
            applicable: detail.tdsEstimate.applicable,
            base: Number(detail.tdsEstimate.base),
            amount: Number(detail.tdsEstimate.amount),
            note: TDS_ESTIMATE_NOTE,
          },
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
    allowed: detail.allowed,
    financial,
    viewerFlags: detail.viewerFlags,
  };
}

export function toFormOptionsResponse(
  options: ContractorBillFormOptions,
): ConstructionContractsContractorBillFormOptionsResponseModel {
  return {
    workOrders: options.workOrders.map((order) => ({
      id: order.id,
      number: order.number,
      orderDate: order.orderDate,
      contractorId: order.contractorId,
      contractorName: order.contractorName,
      unbilled: order.unbilled.map((day) => ({ ...day })),
      openBillId: order.openBillId,
    })),
    today: options.today,
  };
}

export const encodeContractorBillCursor = (cursor: BillCursor): string =>
  encodeListCursor(cursor);
export const decodeContractorBillCursor = (raw: string): BillCursor =>
  decodeListCursor(raw);
