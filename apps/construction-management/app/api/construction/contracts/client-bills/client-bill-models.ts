import { z } from "zod";

import type {
  ClientBillDetail,
  ClientBillFormOptions,
  ClientBillSetup,
  ClientBillView,
  ClientContractView,
} from "@/src/contracts/application/client-bill-handlers";
import type {
  BillCursor,
  BillTotals,
} from "@/src/contracts/application/contractor-bill-ports";
import { quantityText } from "@/src/contracts/domain/boq";
import {
  CLIENT_BILL_DEDUCTION_KINDS,
  type ClientContractTerms,
} from "@/src/contracts/domain/client-bill";
import {
  BILL_STATUSES,
  DEDUCTION_KINDS,
} from "@/src/contracts/domain/contract-terms";
import {
  fixedDecimal,
  PERCENT_SCALE,
} from "@/src/contracts/domain/item-analysis";
import {
  BILL_DEDUCTION_DESCRIPTION_MAX,
  BILL_DEDUCTIONS_MAX,
  BILL_REMARKS_MAX,
  type RetentionSuggestion,
} from "@/src/contracts/domain/ra-bill";
import { FLAGS } from "@/src/shared-kernel/access";
import { gstStateName } from "@/src/shared-kernel/gst-states";
import {
  decodeListCursor,
  encodeListCursor,
} from "@/src/shared-kernel/list-cursor";

import { ConstructionContractsMeasurementLocationModel } from "../measurements/measurement-models";

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

export const CLIENT_BILLS_PATH = "/api/construction/contracts/client-bills";

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

const BLOCKERS = [
  "PROJECT_NOT_CONTRACT_WORK",
  "PROJECT_CLIENT_REQUIRED",
  "PROJECT_STATE_REQUIRED",
] as const;

// ---------------------------------------------------------------------------
// Requests
// ---------------------------------------------------------------------------

export const ConstructionContractsClientBillParamsModel = z.object({
  id: z.uuid(),
});

export const ConstructionContractsClientBillProjectQueryModel = z.object({
  projectId: z.uuid(),
});

export const ListConstructionContractsClientBillsRequestModel = z
  .object({
    projectId: z.uuid(),
    status: z.enum(BILL_STATUSES).optional(),
    type: billTypeFilter,
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

export const ConstructionContractsClientBillDeductionInputModel = z.object({
  kind: z
    .enum(CLIENT_BILL_DEDUCTION_KINDS)
    .describe(
      "What the Client holds back. Secured advance and material reconciliation recoveries arrive with CM-1108 and CM-1110.",
    ),
  amount: z
    .int()
    .describe(
      "Paise, more than 0. Retention is at most the suggestion (400 BILL_RETENTION_OVER_CAP); all deductions at most gross + GST (400 BILL_DEDUCTIONS_TOO_LARGE).",
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
});

const content = {
  billDate: date("Not after today (400 BILL_DATE_IN_FUTURE)."),
  measuredUpTo: date(
    "Checked client-side rows measured on or before this date are taken; not after the bill date (400 MEASURED_UP_TO_AFTER_BILL_DATE).",
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
    .describe(
      "The contract's final bill: printed as such; nothing closes on the client side.",
    ),
  deductions: z
    .array(ConstructionContractsClientBillDeductionInputModel)
    .max(BILL_DEDUCTIONS_MAX * 5)
    .nullable()
    .optional()
    .describe(
      `At most ${String(BILL_DEDUCTIONS_MAX)}. Ignored without Client Bill Financial. Left out: kept (a new draft holds the suggested retention).`,
    ),
};

export const CreateConstructionContractsClientBillRequestModel = z.object({
  projectId: z
    .uuid()
    .describe(
      "A Contract work Project (400 PROJECT_NOT_CONTRACT_WORK) with a Client (400 PROJECT_CLIENT_REQUIRED) and a state (400 PROJECT_STATE_REQUIRED). One draft or pending client bill at a time (409 BILL_OPEN_EXISTS).",
    ),
  ...content,
});
export type CreateConstructionContractsClientBillRequestModel = z.input<
  typeof CreateConstructionContractsClientBillRequestModel
>;

export const UpdateConstructionContractsClientBillRequestModel = z.object({
  ...content,
  expectedUpdatedAt: z.iso
    .datetime()
    .describe("The bill's `updatedAt` as loaded (409 BILL_CHANGED)."),
});
export type UpdateConstructionContractsClientBillRequestModel = z.input<
  typeof UpdateConstructionContractsClientBillRequestModel
>;

export const RefreshConstructionContractsClientBillRequestModel = z.object({
  measuredUpTo: date("Left out: the bill's own. Takes the rows checked since.")
    .nullable()
    .optional(),
  expectedUpdatedAt: optionalExpected,
});

export const ConstructionContractsClientBillStepRequestModel = z.object({
  expectedUpdatedAt: optionalExpected,
});

export const RejectConstructionContractsClientBillRequestModel = z.object({
  reason: reason("REJECTION_REASON_REQUIRED"),
  expectedUpdatedAt: optionalExpected,
});

export const ReverseConstructionContractsClientBillRequestModel = z.object({
  reason: reason("REVERSE_REASON_REQUIRED"),
  expectedUpdatedAt: optionalExpected,
});

const percentInput = z
  .union([z.string().max(20), z.number()])
  .nullable()
  .optional();

export const UpdateConstructionContractsClientContractRequestModel = z.object({
  projectId: z.uuid(),
  expectedUpdatedAt: z.iso
    .datetime()
    .nullable()
    .optional()
    .describe(
      "The terms' `updatedAt` as loaded; null or left out the first time (409 CLIENT_CONTRACT_CHANGED).",
    ),
  retentionPercent: percentInput.describe(
    "Retention per bill, 0–100 with two places; blank is 0.",
  ),
  retentionCapPercent: percentInput.describe(
    "Retention stops at this % of the BOQ's current value; blank is no cap.",
  ),
  retentionCompletionPercent: percentInput.describe(
    "Released at completion, the rest at the DLP end; blank is 50.",
  ),
  dlpMonths: z.int().nullable().optional().describe("0–120 months."),
  handoverOn: z
    .string()
    .max(30)
    .nullable()
    .optional()
    .describe("YYYY-MM-DD: the client side's DLP starts here (CM-1108)."),
  sacCode: z
    .string()
    .max(20)
    .nullable()
    .optional()
    .describe("4–8 digits; works contracts are 9954."),
  gstRate: percentInput.describe("0–28 with two places; blank is no GST."),
});
export type UpdateConstructionContractsClientContractRequestModel = z.input<
  typeof UpdateConstructionContractsClientContractRequestModel
>;

// ---------------------------------------------------------------------------
// Responses
// ---------------------------------------------------------------------------

const money = (description: string) =>
  z
    .int()
    .nullable()
    .describe(`${description} Null without Client Bill Financial.`);

const quantity = (description: string) =>
  z.string().describe(`${description} Four places ("12.5000").`);

const percentText = z.string().describe('Two places ("5.00").');

const summary = {
  id: z.uuid(),
  projectId: z.uuid(),
  clientId: z.uuid(),
  clientName: z.string(),
  number: z
    .string()
    .nullable()
    .describe("Null on a draft never submitted (screens show “Draft”)."),
  ordinal: z
    .int()
    .nullable()
    .describe("RA bill 1, 2, … on the Project's client side; set at submit."),
  billDate: z.string(),
  measuredUpTo: z.string(),
  isFinal: z.boolean(),
  status: z.enum(BILL_STATUSES),
  type: billTypeField,
  ...billPeriodFields,
  gross: money("Paise: cumulative value − previous value (the taxable value)."),
  gst: money("Paise: CGST + SGST + IGST."),
  deductions: money("Paise: what the Client holds back."),
  net: money("Paise: gross + GST − deductions, the net receivable."),
  invoiceId: z
    .uuid()
    .nullable()
    .describe("The receivable invoice in finance, once approved."),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso
    .datetime()
    .describe("Send it back as `expectedUpdatedAt` when you change it."),
};

export const ConstructionContractsClientBillSummaryModel = z.object(summary);
export type ConstructionContractsClientBillSummaryModel = z.infer<
  typeof ConstructionContractsClientBillSummaryModel
>;

export const ConstructionContractsClientBillTotalsModel = z.object({
  count: z.int().nonnegative(),
  gross: money("Paise."),
  gst: money("Paise."),
  deductions: money("Paise."),
  net: money("Paise."),
});

export const ConstructionContractsClientBillSetupModel = z
  .object({
    role: z.enum(["contract", "own"]),
    clientId: z.uuid().nullable(),
    clientName: z.string().nullable(),
    stateCode: z.string().nullable(),
    stateName: z.string().nullable(),
    blockers: z
      .array(z.enum(BLOCKERS))
      .describe(
        "Why the Project cannot be billed yet, in the order to fix them; empty when it can.",
      ),
  })
  .describe("The Project as Client Bills need it.");

export const ListConstructionContractsClientBillsResponseModel = z.object({
  items: z.array(ConstructionContractsClientBillSummaryModel),
  nextCursor: z.string().nullable(),
  prevCursor: z.string().nullable(),
  total: z.int().nonnegative(),
  totals: ConstructionContractsClientBillTotalsModel.describe(
    "Over the bills the filter matches that count: draft, pending and approved (not rejected or reversed).",
  ),
  retentionReceivable: money(
    "Paise the Client holds as retention on approved bills, less releases (CM-1108).",
  ),
  setup: ConstructionContractsClientBillSetupModel,
  financial: z.boolean(),
  viewerFlags: z
    .array(z.enum(FLAGS))
    .describe("The Client Bill flags the caller holds on the Project."),
});
export type ListConstructionContractsClientBillsResponseModel = z.infer<
  typeof ListConstructionContractsClientBillsResponseModel
>;

export const ConstructionContractsClientBillRowModel = z.object({
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

export const ConstructionContractsClientBillLineModel = z.object({
  id: z.uuid(),
  boqItemId: z.uuid(),
  itemNo: z.string().nullable(),
  description: z.string(),
  uomId: z.uuid(),
  uomName: z.string(),
  rate: money(
    "Paise per UoM: the BOQ item's current rate when the bill was drafted or refreshed.",
  ),
  previousQuantity: quantity("On earlier approved client bills."),
  quantity: quantity("This bill: Σ its rows."),
  cumulativeQuantity: quantity("Previous + this."),
  boqQuantity: quantity("The BOQ item's current quantity.").nullable(),
  deviation: z
    .object({
      over: z.boolean().describe("Cumulative is above the BOQ quantity."),
      overBy: quantity("Cumulative − BOQ quantity.").nullable(),
      percentOver: percentText.nullable(),
      overLimit: z
        .boolean()
        .describe(
          "Beyond the Company's deviation limit: the item needs a Variation.",
        ),
    })
    .describe(
      "Billing past the BOQ is allowed on the client side (ADR CM-0023 §4) and marked here.",
    ),
  amount: money("Paise: round(cumulative × rate) − round(previous × rate)."),
  rows: z.array(ConstructionContractsClientBillRowModel),
});

export const ConstructionContractsClientBillDeductionModel = z.object({
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
});

export const ConstructionContractsClientBillRetentionModel = z.object({
  percent: percentText.describe("The client contract's retention % per bill."),
  capPercent: percentText
    .nullable()
    .describe("The cap as a % of the BOQ's current value."),
  byPercent: money("Paise: gross × retention %."),
  cap: money("Paise: cap % × the BOQ's current value."),
  heldBefore: money("Paise held on the Project's other approved client bills."),
  suggested: money("Paise: what this bill may hold, at most."),
});

export const ConstructionContractsClientContractTermsModel = z.object({
  retentionPercent: percentText,
  retentionCapPercent: percentText.nullable(),
  retentionCompletionPercent: percentText,
  dlpMonths: z.int().nullable(),
  handoverOn: z.string().nullable(),
  sacCode: z.string().nullable(),
  gstRate: percentText.nullable(),
});

export const ConstructionContractsClientBillAllowedModel = z.object({
  edit: z.boolean(),
  refresh: z.boolean(),
  delete: z.boolean(),
  submit: z.boolean(),
  approve: z.boolean(),
  reject: z.boolean(),
  reverse: z.boolean(),
  print: z.boolean(),
});

const party = z.object({
  name: z.string(),
  address: z.string().nullable(),
  gstin: z.string().nullable(),
  stateCode: z.string().nullable(),
  stateName: z.string().nullable(),
});

export const GetConstructionContractsClientBillResponseModel = z.object({
  ...summary,
  projectName: z.string(),
  supplier: party
    .nullable()
    .describe(
      "The Company billing address whose GSTIN the invoice carries (the one in the Project's state, else the default).",
    ),
  recipient: party
    .extend({ pinCode: z.string().nullable() })
    .nullable()
    .describe("The Client."),
  placeOfSupply: z
    .object({ stateCode: z.string(), stateName: z.string().nullable() })
    .nullable()
    .describe("The Project's state: works on immovable property."),
  supplierGstin: z.string().nullable(),
  recipientGstin: z.string().nullable(),
  warnings: z
    .array(
      z.object({ code: z.enum(["GSTIN_NOT_IN_STATE"]), message: z.string() }),
    )
    .describe(
      "GSTIN_NOT_IN_STATE: the Company has no GSTIN in the place of supply's state. A warning, not an error.",
    ),
  cumulativeValue: money("Paise: Σ round(cumulative × rate)."),
  previousValue: money("Paise: Σ round(previous × rate)."),
  sacCode: z.string().nullable(),
  gstRate: percentText.nullable(),
  supplyType: z.enum(["intra_state", "inter_state"]),
  cgst: money("Paise."),
  sgst: money("Paise."),
  igst: money("Paise."),
  lines: z.array(ConstructionContractsClientBillLineModel),
  deductionLines: z.array(ConstructionContractsClientBillDeductionModel),
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
  retention: ConstructionContractsClientBillRetentionModel,
  retentionReceivable: money(
    "Paise: retention the Client holds on the Project's approved bills less releases (derived in contracts, CM-1108).",
  ),
  terms: ConstructionContractsClientContractTermsModel,
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
  allowed: ConstructionContractsClientBillAllowedModel,
  financial: z.boolean(),
  viewerFlags: z.array(z.enum(FLAGS)),
});
export type GetConstructionContractsClientBillResponseModel = z.infer<
  typeof GetConstructionContractsClientBillResponseModel
>;

export const ConstructionContractsClientBillSuggestionsResponseModel = z.object(
  {
    retention: ConstructionContractsClientBillRetentionModel,
    mobilisationRecovery: money(
      "Paise: Σ the suggested mobilisation advance recoveries; null when there is none.",
    ),
    recoveries: z
      .array(ConstructionContractsBillAdvanceModel)
      .describe(
        "One per advance of the contract with what this bill suggests recovering (CM-1108).",
      ),
  },
);
export type ConstructionContractsClientBillSuggestionsResponseModel = z.infer<
  typeof ConstructionContractsClientBillSuggestionsResponseModel
>;

export const ConstructionContractsClientBillFormOptionsResponseModel = z.object(
  {
    setup: ConstructionContractsClientBillSetupModel,
    unbilled: z
      .array(z.object({ measuredOn: z.string(), rows: z.int().nonnegative() }))
      .describe(
        "Checked client-side rows waiting to be billed, per date measured.",
      ),
    openBillId: z
      .uuid()
      .nullable()
      .describe("A draft or pending client bill already on the Project."),
    today: z.string(),
  },
);
export type ConstructionContractsClientBillFormOptionsResponseModel = z.infer<
  typeof ConstructionContractsClientBillFormOptionsResponseModel
>;

export const GetConstructionContractsClientContractResponseModel = z.object({
  projectId: z.uuid(),
  terms: ConstructionContractsClientContractTermsModel,
  updatedAt: z.iso
    .datetime()
    .nullable()
    .describe("Null before the terms are first saved."),
  boqValue: money("Paise: the BOQ's current value (the retention cap's base)."),
  retentionReceivable: money(
    "Paise held on approved client bills, less releases (CM-1108).",
  ),
  canEdit: z.boolean().describe("Client Bill update on the Project."),
  financial: z.boolean(),
});
export type GetConstructionContractsClientContractResponseModel = z.infer<
  typeof GetConstructionContractsClientContractResponseModel
>;

// ---------------------------------------------------------------------------
// Mapping
// ---------------------------------------------------------------------------

const paise = (value: bigint | null, financial: boolean): number | null =>
  financial && value != null ? Number(value) : null;

const percent = (value: bigint) => fixedDecimal(value, PERCENT_SCALE);

const optionalQuantity = (value: bigint | null) =>
  value == null ? null : quantityText(value);

function summaryOf(view: ClientBillView, financial: boolean) {
  return {
    id: view.id,
    projectId: view.projectId,
    clientId: view.clientId,
    clientName: view.clientName,
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
    deductions: paise(view.deductionsTotal, financial),
    net: paise(view.net, financial),
    invoiceId: view.invoiceId,
    createdAt: view.createdAt.toISOString(),
    updatedAt: view.updatedAt.toISOString(),
  };
}

export function toClientBillSummaryResponse(
  view: ClientBillView,
  financial: boolean,
): ConstructionContractsClientBillSummaryModel {
  return summaryOf(view, financial);
}

export function toClientBillTotalsResponse(
  totals: BillTotals,
  financial: boolean,
) {
  return {
    count: totals.count,
    gross: paise(totals.gross, financial),
    gst: paise(totals.gst, financial),
    deductions: paise(totals.deductions, financial),
    net: paise(totals.net, financial),
  };
}

export function toClientBillSetupResponse(setup: ClientBillSetup) {
  return {
    role: setup.role,
    clientId: setup.clientId,
    clientName: setup.clientName,
    stateCode: setup.stateCode,
    stateName:
      setup.stateCode == null ? null : (gstStateName(setup.stateCode) ?? null),
    blockers: [...setup.blockers],
  };
}

export function toClientRetentionResponse(
  retention: RetentionSuggestion,
  terms: ClientContractTerms,
  financial: boolean,
) {
  return {
    percent: percent(terms.retentionPercent),
    capPercent:
      terms.retentionCapPercent == null
        ? null
        : percent(terms.retentionCapPercent),
    byPercent: paise(retention.byPercent, financial),
    cap: paise(retention.cap, financial),
    heldBefore: paise(retention.heldBefore, financial),
    suggested: paise(retention.suggested, financial),
  };
}

export function toClientContractTermsResponse(terms: ClientContractTerms) {
  return {
    retentionPercent: percent(terms.retentionPercent),
    retentionCapPercent:
      terms.retentionCapPercent == null
        ? null
        : percent(terms.retentionCapPercent),
    retentionCompletionPercent: percent(terms.retentionCompletionPercent),
    dlpMonths: terms.dlpMonths,
    handoverOn: terms.handoverOn,
    sacCode: terms.sacCode,
    gstRate: terms.gstRate == null ? null : percent(terms.gstRate),
  };
}

const stateName = (code: string | null) =>
  code == null ? null : (gstStateName(code) ?? null);

export function toClientBillResponse(
  detail: ClientBillDetail,
): GetConstructionContractsClientBillResponseModel {
  const { bill, financial } = detail;
  const supplierState =
    bill.supplierGstin?.slice(0, 2) ?? detail.supplier?.stateCode ?? null;
  return {
    ...summaryOf(bill, financial),
    projectName: detail.projectName,
    supplier:
      detail.supplier == null
        ? null
        : {
            name: detail.supplier.name,
            address: detail.supplier.address,
            gstin: bill.supplierGstin,
            stateCode: supplierState,
            stateName: stateName(supplierState),
          },
    recipient:
      detail.client == null
        ? null
        : {
            name: detail.client.name,
            address: detail.client.address,
            gstin: bill.recipientGstin,
            stateCode: detail.client.stateCode,
            stateName: stateName(detail.client.stateCode),
            pinCode: detail.client.pinCode,
          },
    placeOfSupply:
      bill.placeOfSupplyStateCode == null
        ? null
        : {
            stateCode: bill.placeOfSupplyStateCode,
            stateName: stateName(bill.placeOfSupplyStateCode),
          },
    supplierGstin: bill.supplierGstin,
    recipientGstin: bill.recipientGstin,
    warnings: detail.warnings.map((warning) => ({ ...warning })),
    cumulativeValue: paise(bill.cumulativeValue, financial),
    previousValue: paise(bill.previousValue, financial),
    sacCode: bill.sacCode,
    gstRate: bill.gstRate == null ? null : percent(bill.gstRate),
    supplyType: detail.supplyType,
    cgst: paise(bill.cgst, financial),
    sgst: paise(bill.sgst, financial),
    igst: paise(bill.igst, financial),
    lines: detail.lines.map((line) => ({
      id: line.id,
      boqItemId: line.boqItemId,
      itemNo: line.itemNo,
      description: line.description,
      uomId: line.uomId,
      uomName: line.uomName,
      rate: paise(line.rate, financial),
      previousQuantity: quantityText(line.previousQuantity),
      quantity: quantityText(line.quantity),
      cumulativeQuantity: quantityText(line.cumulativeQuantity),
      boqQuantity: optionalQuantity(line.boqQuantity),
      deviation: {
        over: line.deviation.over,
        overBy: optionalQuantity(line.deviation.overBy),
        percentOver:
          line.deviation.percentOver == null
            ? null
            : percent(line.deviation.percentOver),
        overLimit: line.deviation.overLimit,
      },
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
    })),
    advances: toBillAdvancesResponse(detail.advances, financial),
    escalationRecoveries: toBillEscalationRecoveriesResponse(
      detail.escalationRecoveries,
      financial,
    ),
    retention: toClientRetentionResponse(
      detail.retention,
      detail.terms,
      financial,
    ),
    retentionReceivable: paise(detail.retentionReceivable, financial),
    terms: toClientContractTermsResponse(detail.terms),
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

export function toClientBillFormOptionsResponse(
  options: ClientBillFormOptions,
): ConstructionContractsClientBillFormOptionsResponseModel {
  return {
    setup: toClientBillSetupResponse(options.setup),
    unbilled: options.unbilled.map((day) => ({ ...day })),
    openBillId: options.openBillId,
    today: options.today,
  };
}

export function toClientContractResponse(
  projectId: string,
  view: ClientContractView,
): GetConstructionContractsClientContractResponseModel {
  return {
    projectId,
    terms: toClientContractTermsResponse(view.terms),
    updatedAt: view.updatedAt?.toISOString() ?? null,
    boqValue: paise(view.boqValue, view.financial),
    retentionReceivable: paise(view.retentionReceivable, view.financial),
    canEdit: view.canEdit,
    financial: view.financial,
  };
}

export const encodeClientBillCursor = (cursor: BillCursor): string =>
  encodeListCursor(cursor);
export const decodeClientBillCursor = (raw: string): BillCursor =>
  decodeListCursor(raw);
