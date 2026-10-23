import { z } from "zod";

import type { EscalationClauseView } from "@/src/contracts/application/escalation-clause-handlers";
import { ESCALATION_COMPONENTS } from "@/src/contracts/domain/contract-terms";
import { ESCALATION_BASES } from "@/src/contracts/domain/escalation";
import {
  fixedDecimal,
  PERCENT_SCALE,
} from "@/src/contracts/domain/item-analysis";

export const ESCALATION_CLAUSES_PATH =
  "/api/construction/contracts/escalation-clauses";

const percent = z.union([z.string().max(30), z.number()]);

export const ConstructionContractsEscalationClauseParamsModel = z.object({
  id: z.uuid(),
});

const ComponentInput = z.object({
  component: z.enum(ESCALATION_COMPONENTS),
  basis: z
    .enum(ESCALATION_BASES)
    .optional()
    .describe(
      "`weighted` (10CC, the default) or `quantity` (10CA: cement and steel only; 400 ESCALATION_BASIS_INVALID).",
    ),
  weightPercent: percent
    .nullable()
    .optional()
    .describe(
      "Weighted: more than 0 up to 100, two places. The weighted components sum to 100 (400 ESCALATION_WEIGHTS_NOT_100, `details.total`).",
    ),
  series: z
    .string()
    .max(500)
    .describe("The price index series (free text, at most 80 characters)."),
  basePrice: z
    .int()
    .nullable()
    .optional()
    .describe(
      "Quantity basis: paise per unit at the base month (400 ESCALATION_BASE_PRICE_INVALID).",
    ),
  materialId: z
    .uuid()
    .nullable()
    .optional()
    .describe(
      "Quantity basis on a Work Order: a Material it issues, whose reconciled consumption in the period fills the escalation draft's quantity (CM-1110; 400 ESCALATION_MATERIAL_INVALID). Ignored on the weighted basis.",
    ),
});

const terms = {
  baseMonth: z
    .string()
    .max(30)
    .describe(
      "YYYY-MM, not after this month (400 ESCALATION_BASE_MONTH_INVALID, ESCALATION_BASE_MONTH_IN_FUTURE).",
    ),
  nonEscalablePercent: percent
    .nullable()
    .optional()
    .describe(
      "0 to below 100, two places; blank 15 (400 ESCALATION_NON_ESCALABLE_INVALID).",
    ),
  components: z.array(ComponentInput).max(20),
};

export const CreateConstructionContractsEscalationClauseRequestModel = z.object(
  {
    projectId: z.uuid(),
    workOrderId: z
      .uuid()
      .nullable()
      .optional()
      .describe(
        "A Work Order of the Project (contractor side); none means the Project's client contract. One clause per contract (409 ESCALATION_CLAUSE_EXISTS).",
      ),
    ...terms,
  },
);

export const UpdateConstructionContractsEscalationClauseRequestModel = z.object(
  {
    ...terms,
    expectedUpdatedAt: z.iso
      .datetime()
      .describe("The clause's `updatedAt` (409 ESCALATION_CLAUSE_CHANGED)."),
  },
);

export const DeleteConstructionContractsEscalationClauseRequestModel = z.object(
  {
    expectedUpdatedAt: z.iso.datetime().optional(),
  },
);

export const ConstructionContractsEscalationClauseQueryModel = z.object({
  projectId: z.uuid(),
});

export const ConstructionContractsEscalationClauseResponseModel = z.object({
  side: z.enum(["contractor", "client"]),
  projectId: z.uuid(),
  workOrderId: z.uuid().nullable(),
  workOrderNumber: z.string().nullable(),
  clause: z
    .object({
      id: z.uuid(),
      baseMonth: z.string(),
      nonEscalablePercent: z
        .string()
        .nullable()
        .describe("Null without Financial."),
      components: z.array(
        z.object({
          component: z.enum(ESCALATION_COMPONENTS),
          basis: z.enum(ESCALATION_BASES),
          weightPercent: z
            .string()
            .nullable()
            .describe("Weighted only; null without Financial."),
          series: z.string(),
          basePrice: z
            .int()
            .nullable()
            .describe("Quantity only, paise per unit; null without Financial."),
          materialId: z
            .uuid()
            .nullable()
            .describe(
              "Quantity only: the Material filling the 10CA quantity (CM-1110).",
            ),
        }),
      ),
      updatedAt: z.iso.datetime(),
    })
    .nullable(),
  approvedBills: z
    .int()
    .nonnegative()
    .describe(
      "Approved escalation bills on the contract: the clause is locked while any (409 ESCALATION_CLAUSE_USED).",
    ),
  financial: z.boolean(),
  canEdit: z.boolean(),
  materialOptions: z
    .array(z.object({ id: z.uuid(), name: z.string(), uomName: z.string() }))
    .describe(
      "The Work Order's issued materials a 10CA component can name (CM-1110); none on the client side.",
    ),
});
export type ConstructionContractsEscalationClauseResponseModel = z.infer<
  typeof ConstructionContractsEscalationClauseResponseModel
>;

const pct = (value: bigint) => fixedDecimal(value, PERCENT_SCALE);

export function toEscalationClauseResponse(
  view: EscalationClauseView,
): ConstructionContractsEscalationClauseResponseModel {
  const { clause, financial } = view;
  return {
    side: view.side,
    projectId: view.projectId,
    workOrderId: view.workOrderId,
    workOrderNumber: view.workOrderNumber,
    clause:
      clause == null
        ? null
        : {
            id: clause.id,
            baseMonth: clause.terms.baseMonth,
            nonEscalablePercent: financial
              ? pct(clause.terms.nonEscalablePercent)
              : null,
            components: clause.terms.components.map((row) => ({
              component: row.component,
              basis: row.basis,
              weightPercent:
                financial && row.basis === "weighted"
                  ? pct(row.weightPercent)
                  : null,
              series: row.series,
              basePrice:
                financial && row.basePrice != null
                  ? Number(row.basePrice)
                  : null,
              materialId: row.materialId,
            })),
            updatedAt: clause.updatedAt.toISOString(),
          },
    approvedBills: view.approvedBills,
    financial,
    canEdit: view.canEdit,
    materialOptions: view.materialOptions,
  };
}
