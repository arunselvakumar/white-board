import { z } from "zod";

import type {
  WorkOrderBoqItemOption,
  WorkOrderDetail,
  WorkOrderFormOptions,
  WorkOrderView,
} from "@/src/contracts/application/work-order-handlers";
import type {
  WorkOrderCursor,
  WorkOrderSnapshot,
} from "@/src/contracts/application/work-order-ports";
import type { ContractsMaterialFacts } from "@/src/contracts/application/ports";
import {
  BOQ_ITEM_DESCRIPTION_MAX,
  BOQ_ITEM_NO_MAX,
  quantityText,
} from "@/src/contracts/domain/boq";
import {
  ISSUE_BASES,
  TDS_NATURES,
  WORK_ORDER_LINE_KINDS,
  WORK_ORDER_STATUSES,
} from "@/src/contracts/domain/contract-terms";
import {
  COEFFICIENT_SCALE,
  fixedDecimal,
  PERCENT_SCALE,
} from "@/src/contracts/domain/item-analysis";
import {
  DLP_MONTHS_MAX,
  overRemainingMessage,
  WORK_ORDER_LINES_MAX,
  WORK_ORDER_MATERIALS_MAX,
  WORK_ORDER_SCOPE_MAX,
  type OverRemaining,
} from "@/src/contracts/domain/work-order";
import { FLAGS } from "@/src/shared-kernel/access";
import {
  decodeListCursor,
  encodeListCursor,
} from "@/src/shared-kernel/list-cursor";

export const WORK_ORDERS_PATH = "/api/construction/contracts/work-orders";

const decimalInput = z.union([z.string().trim().max(30), z.number()]);
const percentInput = (what: string) =>
  decimalInput
    .nullable()
    .optional()
    .describe(`${what}: 0 to 100, at most two decimals.`);
const optionalExpected = z.iso
  .datetime()
  .optional()
  .describe(
    "The Work Order's `updatedAt` as loaded; when sent, a stale one is refused with 409 WORK_ORDER_CHANGED.",
  );
const reason = (code: string) =>
  z
    .string()
    .max(2000)
    .describe(`Required, at most 500 characters (400 ${code}).`);

// ---------------------------------------------------------------------------
// Requests
// ---------------------------------------------------------------------------

export const ConstructionContractsWorkOrderParamsModel = z.object({
  id: z.uuid(),
});

export const ConstructionContractsWorkOrderProjectQueryModel = z.object({
  projectId: z.uuid(),
});

export const ListConstructionContractsWorkOrderBoqItemsRequestModel = z.object({
  projectId: z.uuid(),
  workOrderId: z
    .uuid()
    .optional()
    .describe(
      "The Work Order being edited: its own lines do not count against what is left.",
    ),
});

export const ListConstructionContractsWorkOrderMaterialOptionsRequestModel =
  z.object({
    projectId: z.uuid(),
    q: z.string().trim().max(200).optional().describe("Part of the name."),
  });

export const ListConstructionContractsWorkOrdersRequestModel = z
  .object({
    projectId: z.uuid(),
    status: z.enum(WORK_ORDER_STATUSES).optional(),
    contractorId: z.uuid().optional(),
    q: z
      .string()
      .trim()
      .max(200)
      .optional()
      .describe("Part of the number or the scope note, ignoring case."),
    limit: z.coerce.number().int().min(1).max(100).optional().default(25),
    after: z.string().min(1).max(500).optional(),
    before: z.string().min(1).max(500).optional(),
  })
  .refine((value) => value.after == null || value.before == null, {
    message: "after and before are mutually exclusive.",
    path: ["after"],
  });

export const ConstructionContractsWorkOrderTermsInputModel = z.object({
  retentionPercent: percentInput("Retention % of each bill; blank is 0"),
  retentionCapPercent: percentInput(
    "Retention stops at this % of the Work Order's value; blank is no cap",
  ),
  retentionCompletionPercent: percentInput(
    "Retention released on completion; blank is 50, the rest at the DLP end",
  ),
  dlpMonths: z
    .int()
    .nullable()
    .optional()
    .describe(
      `Defects liability period, 0 to ${String(DLP_MONTHS_MAX)} months.`,
    ),
  tdsNature: z
    .enum(TDS_NATURES)
    .nullable()
    .optional()
    .describe(
      "Provisional TDS nature keys (finance's arrive in CM-1116). Left out: `contractor` when the Contractor has TDS applicable, else none (on an edit: kept). Null: no TDS.",
    ),
  sacCode: z
    .string()
    .max(30)
    .nullable()
    .optional()
    .describe(
      "9954, 9985, 9987 or any 4 to 8 digit SAC (400 SAC_HSN_INVALID).",
    ),
  gstRate: decimalInput
    .nullable()
    .optional()
    .describe("GST %, 0 to 28, at most two decimals (400 GST_RATE_INVALID)."),
  reverseCharge: z.boolean().nullable().optional(),
  mobilisationAdvance: z
    .int()
    .nullable()
    .optional()
    .describe(
      "Paise. Ignored without Work Order Financial (kept on an edit). The advance itself is paid in CM-1108.",
    ),
  mobilisationRecoveryPercent: percentInput(
    "% of each bill that recovers the mobilisation advance",
  ),
});

export const ConstructionContractsWorkOrderLineInputModel = z.object({
  id: z
    .uuid()
    .nullable()
    .optional()
    .describe(
      "An existing line to keep (400 WORK_ORDER_LINE_NOT_FOUND otherwise); its kind and BOQ item stay. Left out: a new line. Lines not sent are removed.",
    ),
  kind: z.enum(WORK_ORDER_LINE_KINDS),
  boqItemId: z
    .uuid()
    .nullable()
    .optional()
    .describe(
      "A BOQ line's live BOQ item of the Project (400 WORK_ORDER_BOQ_ITEM_INVALID).",
    ),
  itemNo: z
    .string()
    .max(1000)
    .nullable()
    .optional()
    .describe(
      `At most ${String(BOQ_ITEM_NO_MAX)} characters. Left out on a BOQ line: the BOQ item's.`,
    ),
  description: z
    .string()
    .max(40_000)
    .nullable()
    .optional()
    .describe(
      `At most ${BOQ_ITEM_DESCRIPTION_MAX.toLocaleString("en-IN")} characters; required on a non-BOQ line. Blank on a BOQ line: the BOQ item's.`,
    ),
  uomId: z
    .uuid()
    .nullable()
    .optional()
    .describe(
      "Required on a non-BOQ line. Blank on a BOQ line: the BOQ item's.",
    ),
  sacHsn: z.string().max(30).nullable().optional(),
  quantity: decimalInput
    .nullable()
    .optional()
    .describe(
      "More than 0, four places. Left out on a new BOQ line: what the BOQ has left. More than is left is a warning, never a refusal.",
    ),
  rate: z
    .int()
    .nullable()
    .optional()
    .describe(
      "Paise per UoM, the work-order rate. Left out on a BOQ line: the BOQ's current rate. Ignored without Financial (a kept line keeps its rate, a new BOQ line takes the BOQ's, a non-BOQ line ₹0).",
    ),
});

export const ConstructionContractsWorkOrderMaterialInputModel = z.object({
  materialId: z.uuid(),
  issueBasis: z.enum(ISSUE_BASES),
  issueRate: z
    .int()
    .nullable()
    .optional()
    .describe(
      "Paise per material UoM; required at cost. Ignored without Financial.",
    ),
  wastagePercent: percentInput("Permissible wastage"),
  penalRate: z
    .int()
    .nullable()
    .optional()
    .describe(
      "Paise per material UoM charged on the excess. Ignored without Financial.",
    ),
  coefficients: z
    .array(
      z.object({
        line: z.int().describe("The line's index in `lines`, from 0."),
        coefficient: decimalInput
          .nullable()
          .describe(
            "Material per unit of the line, four places; blank is none.",
          ),
      }),
    )
    .max(WORK_ORDER_LINES_MAX)
    .optional()
    .describe(
      "Lines left out take the coefficient of the Material in the rate analysis of their BOQ item's library Item.",
    ),
});

const content = {
  contractorId: z
    .uuid()
    .describe(
      "A Contractor assigned to the Project (400 WORK_ORDER_CONTRACTOR_INVALID).",
    ),
  departmentId: z
    .uuid()
    .nullable()
    .optional()
    .describe(
      "One of the Contractor's Departments (400 WORK_ORDER_DEPARTMENT_INVALID).",
    ),
  orderDate: z
    .string()
    .describe(
      "YYYY-MM-DD; the Back-dated Entry policy applies (403 BACKDATED_*_BLOCKED, FINANCIAL_PERIOD_CLOSED).",
    ),
  validUntil: z
    .string()
    .nullable()
    .optional()
    .describe(
      "On or after the order date (400 VALID_UNTIL_BEFORE_ORDER_DATE).",
    ),
  scope: z
    .string()
    .max(40_000)
    .nullable()
    .optional()
    .describe(
      `The scope note, at most ${WORK_ORDER_SCOPE_MAX.toLocaleString("en-IN")} characters.`,
    ),
  terms: ConstructionContractsWorkOrderTermsInputModel.optional(),
  lines: z
    .array(ConstructionContractsWorkOrderLineInputModel)
    .max(WORK_ORDER_LINES_MAX)
    .describe(
      `1 to ${String(WORK_ORDER_LINES_MAX)} lines (400 WORK_ORDER_LINES_REQUIRED).`,
    ),
  materials: z
    .array(ConstructionContractsWorkOrderMaterialInputModel)
    .max(WORK_ORDER_MATERIALS_MAX)
    .optional()
    .describe(
      "Materials the Company issues (CM-0023 §10), each once. Left out on an edit: kept.",
    ),
};

export const CreateConstructionContractsWorkOrderRequestModel = z.object({
  projectId: z.uuid(),
  ...content,
});
export type CreateConstructionContractsWorkOrderRequestModel = z.input<
  typeof CreateConstructionContractsWorkOrderRequestModel
>;

export const UpdateConstructionContractsWorkOrderRequestModel = z.object({
  ...content,
  expectedUpdatedAt: z.iso
    .datetime()
    .describe(
      "The Work Order's `updatedAt` as loaded (409 WORK_ORDER_CHANGED).",
    ),
});
export type UpdateConstructionContractsWorkOrderRequestModel = z.input<
  typeof UpdateConstructionContractsWorkOrderRequestModel
>;

export const AmendConstructionContractsWorkOrderRequestModel = z.object({
  ...UpdateConstructionContractsWorkOrderRequestModel.shape,
  reason: reason("AMENDMENT_REASON_REQUIRED"),
});
export type AmendConstructionContractsWorkOrderRequestModel = z.input<
  typeof AmendConstructionContractsWorkOrderRequestModel
>;

export const ConstructionContractsWorkOrderStepRequestModel = z.object({
  expectedUpdatedAt: optionalExpected,
});

export const RejectConstructionContractsWorkOrderRequestModel = z.object({
  reason: reason("REJECTION_REASON_REQUIRED"),
  expectedUpdatedAt: optionalExpected,
});

export const CloseConstructionContractsWorkOrderRequestModel = z.object({
  closedOn: z
    .string()
    .describe(
      "YYYY-MM-DD, on or after the order date; also the completion date when none was recorded.",
    ),
  reason: reason("CLOSE_REASON_REQUIRED"),
  expectedUpdatedAt: optionalExpected,
});

export const CancelConstructionContractsWorkOrderRequestModel = z.object({
  reason: reason("CANCEL_REASON_REQUIRED"),
  expectedUpdatedAt: optionalExpected,
});

// ---------------------------------------------------------------------------
// Responses
// ---------------------------------------------------------------------------

const money = (description: string) =>
  z
    .int()
    .nullable()
    .describe(`${description} Null without Work Order Financial.`);

const quantity = (description: string) =>
  z.string().describe(`${description} Four places ("12.5000").`);

const percentText = z.string().describe('Two places ("5.00").');

export const ConstructionContractsWorkOrderTermsModel = z.object({
  retentionPercent: percentText,
  retentionCapPercent: percentText.nullable(),
  retentionCompletionPercent: percentText,
  dlpMonths: z.int().nullable(),
  tdsNature: z.enum(TDS_NATURES).nullable(),
  sacCode: z.string().nullable(),
  gstRate: percentText.nullable(),
  reverseCharge: z.boolean(),
  mobilisationAdvance: money("Paise."),
  mobilisationRecoveryPercent: percentText.nullable(),
});

export const ConstructionContractsWorkOrderWarningModel = z.object({
  code: z.literal("WORK_ORDER_QUANTITY_OVER_REMAINING"),
  boqItemId: z.uuid(),
  itemNo: z.string(),
  ordered: quantity("What this Work Order orders of the item."),
  remaining: quantity(
    "What the BOQ had left after other live Work Orders (may be negative).",
  ),
  message: z.string(),
});

export const ConstructionContractsWorkOrderLineModel = z.object({
  id: z.uuid(),
  kind: z.enum(WORK_ORDER_LINE_KINDS),
  boqItemId: z.uuid().nullable(),
  itemNo: z.string().nullable(),
  description: z.string(),
  uomId: z.uuid(),
  uomName: z.string(),
  sacHsn: z.string().nullable(),
  quantity: quantity("The work-order quantity."),
  rate: money("Paise per UoM: the work-order rate."),
  amount: money("Paise: round(quantity × rate), half up."),
  billed: quantity("On approved bills; it cannot be cut below this."),
  remaining: quantity(
    "BOQ lines: what the BOQ has left after other Work Orders.",
  ).nullable(),
});

export const ConstructionContractsWorkOrderMaterialModel = z.object({
  id: z.uuid(),
  materialId: z.uuid(),
  materialName: z.string(),
  uomName: z.string(),
  issueBasis: z.enum(ISSUE_BASES),
  issueRate: money("Paise per material UoM (at cost)."),
  wastagePercent: percentText,
  penalRate: money("Paise per material UoM."),
  coefficients: z.array(
    z.object({ lineId: z.uuid(), coefficient: z.string() }),
  ),
});

export const ConstructionContractsWorkOrderSnapshotModel = z.object({
  revision: z.int(),
  number: z.string().nullable(),
  contractorId: z.uuid(),
  contractorName: z.string(),
  departmentId: z.uuid().nullable(),
  departmentName: z.string().nullable(),
  orderDate: z.string(),
  validUntil: z.string().nullable(),
  scope: z.string().nullable(),
  terms: ConstructionContractsWorkOrderTermsModel,
  lines: z.array(
    ConstructionContractsWorkOrderLineModel.omit({
      billed: true,
      remaining: true,
    }),
  ),
  value: money("Paise."),
  materials: z.array(
    ConstructionContractsWorkOrderMaterialModel.omit({
      id: true,
      uomName: true,
    }),
  ),
});

export const ConstructionContractsWorkOrderRevisionModel = z.object({
  id: z.uuid(),
  revision: z
    .int()
    .describe("The revision kept: the one the amendment replaced."),
  reason: z.string().nullable().describe("Why it was amended."),
  createdAt: z.iso.datetime(),
  createdBy: z.string(),
  createdByName: z.string().nullable(),
  snapshot: ConstructionContractsWorkOrderSnapshotModel,
});

const summary = {
  id: z.uuid(),
  projectId: z.uuid(),
  number: z
    .string()
    .nullable()
    .describe("Null on a draft never submitted (screens show “Draft”)."),
  status: z.enum(WORK_ORDER_STATUSES),
  revision: z.int().nonnegative(),
  contractorId: z.uuid(),
  contractorName: z.string(),
  departmentId: z.uuid().nullable(),
  departmentName: z.string().nullable(),
  orderDate: z.string(),
  validUntil: z.string().nullable(),
  scope: z.string().nullable(),
  value: money("Paise: the sum of the rounded line amounts."),
  lineCount: z.int().nonnegative(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso
    .datetime()
    .describe("Send it back as `expectedUpdatedAt` when you change it."),
};

export const ConstructionContractsWorkOrderSummaryModel = z.object(summary);
export type ConstructionContractsWorkOrderSummaryModel = z.infer<
  typeof ConstructionContractsWorkOrderSummaryModel
>;

export const ListConstructionContractsWorkOrdersResponseModel = z.object({
  items: z.array(ConstructionContractsWorkOrderSummaryModel),
  nextCursor: z.string().nullable(),
  prevCursor: z.string().nullable(),
  total: z.int().nonnegative(),
  financial: z.boolean(),
  viewerFlags: z
    .array(z.enum(FLAGS))
    .describe("The Work Order flags the caller holds on the Project."),
});
export type ListConstructionContractsWorkOrdersResponseModel = z.infer<
  typeof ListConstructionContractsWorkOrdersResponseModel
>;

export const GetConstructionContractsWorkOrderResponseModel = z.object({
  ...summary,
  projectName: z.string(),
  terms: ConstructionContractsWorkOrderTermsModel,
  lines: z.array(ConstructionContractsWorkOrderLineModel),
  materials: z.array(ConstructionContractsWorkOrderMaterialModel),
  revisions: z
    .array(ConstructionContractsWorkOrderRevisionModel)
    .describe("Earlier revisions, newest first."),
  warnings: z
    .array(ConstructionContractsWorkOrderWarningModel)
    .describe(
      "BOQ items ordered beyond what the BOQ has left (draft, pending or issued).",
    ),
  rejectReason: z.string().nullable(),
  decidedAt: z.iso.datetime().nullable(),
  decidedBy: z.string().nullable(),
  decidedByName: z.string().nullable(),
  completedOn: z.string().nullable(),
  closedOn: z.string().nullable(),
  closeReason: z.string().nullable(),
  cancelledOn: z.string().nullable(),
  cancelReason: z.string().nullable(),
  createdBy: z.string(),
  createdByName: z.string().nullable(),
  financial: z.boolean(),
  viewerFlags: z.array(z.enum(FLAGS)),
});
export type GetConstructionContractsWorkOrderResponseModel = z.infer<
  typeof GetConstructionContractsWorkOrderResponseModel
>;

export const ConstructionContractsWorkOrderFormOptionsResponseModel = z.object({
  contractors: z.array(
    z.object({
      id: z.uuid(),
      name: z.string(),
      gstin: z.string().nullable(),
      tdsApplicable: z.boolean(),
      defaultTdsNature: z.enum(TDS_NATURES).nullable(),
      departments: z.array(z.object({ id: z.uuid(), name: z.string() })),
    }),
  ),
  uoms: z.array(z.object({ id: z.uuid(), name: z.string() })),
  tdsNatures: z.array(
    z.object({ key: z.enum(TDS_NATURES), label: z.string() }),
  ),
  sacPresets: z.array(z.object({ code: z.string(), label: z.string() })),
  gstRates: z.array(z.string()),
  financial: z.boolean(),
});
export type ConstructionContractsWorkOrderFormOptionsResponseModel = z.infer<
  typeof ConstructionContractsWorkOrderFormOptionsResponseModel
>;

export const ConstructionContractsWorkOrderBoqItemModel = z.object({
  id: z.uuid(),
  sectionId: z.uuid(),
  sectionTitle: z.string(),
  libraryItemId: z.uuid().nullable(),
  itemNo: z.string(),
  description: z.string(),
  uomId: z.uuid(),
  uomName: z.string(),
  sacHsn: z.string().nullable(),
  quantity: quantity("The BOQ's current quantity."),
  rate: money(
    "Paise per UoM: the BOQ's current rate (the default work-order rate).",
  ),
  remaining: quantity(
    "Current quantity less other live, non-cancelled Work Orders' lines (may be negative).",
  ),
  analysis: z
    .array(z.object({ materialId: z.uuid(), coefficient: z.string() }))
    .describe(
      "Material per unit from the library Item's rate analysis: the default coefficients.",
    ),
});

export const ListConstructionContractsWorkOrderBoqItemsResponseModel = z.object(
  {
    items: z.array(ConstructionContractsWorkOrderBoqItemModel),
    financial: z.boolean(),
  },
);
export type ListConstructionContractsWorkOrderBoqItemsResponseModel = z.infer<
  typeof ListConstructionContractsWorkOrderBoqItemsResponseModel
>;

export const ListConstructionContractsWorkOrderMaterialOptionsResponseModel =
  z.object({
    items: z.array(
      z.object({
        id: z.uuid(),
        name: z.string(),
        specification: z.string().nullable(),
        uomName: z.string(),
        unitRate: money("Paise per unit: the default issue rate at cost."),
      }),
    ),
  });
export type ListConstructionContractsWorkOrderMaterialOptionsResponseModel =
  z.infer<
    typeof ListConstructionContractsWorkOrderMaterialOptionsResponseModel
  >;

// ---------------------------------------------------------------------------
// Mapping
// ---------------------------------------------------------------------------

const paise = (value: bigint | null, financial: boolean): number | null =>
  financial && value != null ? Number(value) : null;

const percent = (value: bigint) => fixedDecimal(value, PERCENT_SCALE);

function summaryOf(view: WorkOrderView, financial: boolean) {
  return {
    id: view.id,
    projectId: view.projectId,
    number: view.number,
    status: view.status,
    revision: view.revision,
    contractorId: view.contractorId,
    contractorName: view.contractorName,
    departmentId: view.departmentId,
    departmentName: view.departmentName,
    orderDate: view.orderDate,
    validUntil: view.validUntil,
    scope: view.scope,
    value: paise(view.value, financial),
    lineCount: view.lineCount,
    createdAt: view.createdAt.toISOString(),
    updatedAt: view.updatedAt.toISOString(),
  };
}

export function toWorkOrderSummaryResponse(
  view: WorkOrderView,
  financial: boolean,
): ConstructionContractsWorkOrderSummaryModel {
  return summaryOf(view, financial);
}

export function toWarningResponse(warning: OverRemaining) {
  return {
    code: "WORK_ORDER_QUANTITY_OVER_REMAINING" as const,
    boqItemId: warning.boqItemId,
    itemNo: warning.itemNo,
    ordered: quantityText(warning.ordered),
    remaining: quantityText(warning.remaining),
    message: overRemainingMessage(warning),
  };
}

/** A revision as stored, with money nulled without Financial. */
function snapshotResponse(snapshot: WorkOrderSnapshot, financial: boolean) {
  const cash = (value: number | null) => (financial ? value : null);
  return {
    ...snapshot,
    terms: {
      ...snapshot.terms,
      tdsNature: snapshot.terms.tdsNature as
        (typeof TDS_NATURES)[number] | null,
      mobilisationAdvance: cash(snapshot.terms.mobilisationAdvance),
    },
    lines: snapshot.lines.map((line) => ({
      ...line,
      rate: cash(line.rate),
      amount: cash(line.amount),
    })),
    value: cash(snapshot.value),
    materials: snapshot.materials.map((material) => ({
      ...material,
      issueRate: cash(material.issueRate),
      penalRate: cash(material.penalRate),
    })),
  };
}

export function toWorkOrderResponse(
  detail: WorkOrderDetail,
): GetConstructionContractsWorkOrderResponseModel {
  const { workOrder, financial } = detail;
  const { terms } = workOrder;
  return {
    ...summaryOf(workOrder, financial),
    projectName: detail.projectName,
    terms: {
      retentionPercent: percent(terms.retentionPercent),
      retentionCapPercent:
        terms.retentionCapPercent == null
          ? null
          : percent(terms.retentionCapPercent),
      retentionCompletionPercent: percent(terms.retentionCompletionPercent),
      dlpMonths: terms.dlpMonths,
      tdsNature: terms.tdsNature,
      sacCode: terms.sacCode,
      gstRate: terms.gstRate == null ? null : percent(terms.gstRate),
      reverseCharge: terms.reverseCharge,
      mobilisationAdvance: paise(terms.mobilisationAdvance, financial),
      mobilisationRecoveryPercent:
        terms.mobilisationRecoveryPercent == null
          ? null
          : percent(terms.mobilisationRecoveryPercent),
    },
    lines: detail.lines.map((line) => ({
      id: line.id,
      kind: line.kind,
      boqItemId: line.boqItemId,
      itemNo: line.itemNo,
      description: line.description,
      uomId: line.uomId,
      uomName: line.uomName,
      sacHsn: line.sacHsn,
      quantity: quantityText(line.quantity),
      rate: paise(line.rate, financial),
      amount: paise(line.amount, financial),
      billed: quantityText(line.billed),
      remaining: line.remaining == null ? null : quantityText(line.remaining),
    })),
    materials: detail.materials.map((material) => ({
      id: material.id,
      materialId: material.materialId,
      materialName: material.materialName,
      uomName: material.uomName,
      issueBasis: material.issueBasis,
      issueRate: paise(material.issueRate, financial),
      wastagePercent: percent(material.wastagePercent),
      penalRate: paise(material.penalRate, financial),
      coefficients: material.coefficients.map((c) => ({
        lineId: c.lineId,
        coefficient: fixedDecimal(c.coefficient, COEFFICIENT_SCALE),
      })),
    })),
    revisions: detail.revisions.map((revision) => ({
      id: revision.id,
      revision: revision.revision,
      reason: revision.reason,
      createdAt: revision.createdAt.toISOString(),
      createdBy: revision.createdBy,
      createdByName: revision.createdByName,
      snapshot: snapshotResponse(revision.snapshot, financial),
    })),
    warnings: detail.warnings.map(toWarningResponse),
    rejectReason: workOrder.rejectReason,
    decidedAt: workOrder.decidedAt?.toISOString() ?? null,
    decidedBy: workOrder.decidedBy,
    decidedByName: detail.decidedByName,
    completedOn: workOrder.completedOn,
    closedOn: workOrder.closedOn,
    closeReason: workOrder.closeReason,
    cancelledOn: workOrder.cancelledOn,
    cancelReason: workOrder.cancelReason,
    createdBy: workOrder.createdBy,
    createdByName: detail.createdByName,
    financial,
    viewerFlags: detail.viewerFlags,
  };
}

export function toFormOptionsResponse(
  options: WorkOrderFormOptions,
): ConstructionContractsWorkOrderFormOptionsResponseModel {
  return {
    contractors: options.contractors.map((contractor) => ({
      id: contractor.id,
      name: contractor.name,
      gstin: contractor.gstin,
      tdsApplicable: contractor.tdsApplicable,
      defaultTdsNature: contractor.defaultTdsNature,
      departments: contractor.departments.map(({ id, name }) => ({
        id,
        name,
      })),
    })),
    uoms: options.uoms.map(({ id, name }) => ({ id, name })),
    tdsNatures: options.tdsNatures,
    sacPresets: options.sacPresets,
    gstRates: options.gstRates,
    financial: options.financial,
  };
}

export function toBoqItemsResponse(found: {
  items: WorkOrderBoqItemOption[];
  financial: boolean;
}): ListConstructionContractsWorkOrderBoqItemsResponseModel {
  return {
    financial: found.financial,
    items: found.items.map((item) => ({
      id: item.id,
      sectionId: item.sectionId,
      sectionTitle: item.sectionTitle,
      libraryItemId: item.itemId,
      itemNo: item.itemNo,
      description: item.description,
      uomId: item.uomId,
      uomName: item.uomName,
      sacHsn: item.sacHsn,
      quantity: quantityText(item.quantity),
      rate: paise(item.rate, found.financial),
      remaining: quantityText(item.remaining),
      analysis: item.analysis.map((entry) => ({
        materialId: entry.materialId,
        coefficient: fixedDecimal(entry.coefficient, COEFFICIENT_SCALE),
      })),
    })),
  };
}

export function toMaterialOptionsResponse(
  materials: readonly ContractsMaterialFacts[],
  financial: boolean,
): ListConstructionContractsWorkOrderMaterialOptionsResponseModel {
  return {
    items: materials.map((material) => ({
      id: material.id,
      name: material.name,
      specification: material.specification,
      uomName: material.uomName,
      unitRate: paise(material.unitRate, financial),
    })),
  };
}

export const encodeWorkOrderCursor = (cursor: WorkOrderCursor): string =>
  encodeListCursor(cursor);
export const decodeWorkOrderCursor = (raw: string): WorkOrderCursor =>
  decodeListCursor(raw);
