import { z } from "zod";

import type { StoredSalaryStructure } from "@/src/hrms/application/salary-structure-handlers";
import { COMPONENT_BASES } from "@/src/hrms/domain/salary-structure";

/**
 * Salary structure Request and Response models (CM-314). Shapes only: the
 * hrms domain checks every rule and answers with a code naming the field
 * (`details.field`, e.g. `components.2.percent`).
 */

const percent = z
  .string()
  .describe('A percentage with up to two decimals, e.g. "12" or "12.5".');

const paise = z.number().int().describe("Paise.");

const componentFields = {
  name: z.string().max(200),
  basis: z
    .enum(COMPONENT_BASES)
    .describe(
      "`fixed`: a monthly amount. `percent_of_base`: a percentage of the member's base monthly salary (ADR CM-0012 §12).",
    ),
  amount: paise
    .nullable()
    .describe("Paise a month; set for a fixed, non-balancing component."),
  percent: percent
    .nullable()
    .describe("Set for a percentage, non-balancing component."),
  isBalancing: z
    .boolean()
    .describe(
      "Takes base − the other components; at most one per structure, never negative.",
    ),
  countsForPfWage: z
    .boolean()
    .describe("Its earned amount counts towards the PF wage."),
};

const statutoryFields = {
  pf: z.object({
    applicable: z.boolean(),
    employeePercent: percent
      .nullable()
      .describe("Employee PF % override; null = the statutory rate."),
    capAtCeiling: z
      .boolean()
      .describe(
        "Cap the PF wage at the ceiling; off = PF on the whole PF wage.",
      ),
    wageCeiling: paise
      .nullable()
      .describe(
        "PF wage ceiling override in paise; null = the statutory ceiling.",
      ),
  }),
  esi: z.object({
    applicable: z.boolean(),
    employeePercent: percent
      .nullable()
      .describe("Employee ESI % override; null = the statutory rate."),
  }),
  pt: z.object({
    applicable: z.boolean(),
    monthlyAmount: paise
      .nullable()
      .describe(
        "Flat professional tax a month; null = the slab of the HRMS Settings state.",
      ),
  }),
  deductAbsentDays: z.boolean(),
  deductUnpaidLeave: z.boolean(),
  otherDeductions: z
    .array(z.object({ name: z.string().max(200), amount: paise }))
    .max(50),
  isActive: z
    .boolean()
    .describe("An inactive structure cannot be given to more members."),
};

/** The body of create and update: the whole structure at once. */
export const salaryStructureSaveFields = {
  name: z.string().max(200),
  description: z.string().max(1000).nullable(),
  components: z
    .array(
      z.object({
        id: z
          .uuid()
          .nullable()
          .describe(
            "An existing component's id (keeps member overrides); null for a new one.",
          ),
        ...componentFields,
      }),
    )
    .max(50),
  ...statutoryFields,
};

export const ConstructionHrmsSalaryStructureResponseModel = z.object({
  id: z.uuid(),
  name: z.string(),
  description: z.string().nullable(),
  components: z.array(z.object({ id: z.uuid(), ...componentFields })),
  ...statutoryFields,
  membersUsing: z
    .number()
    .int()
    .describe("Members whose salary configuration uses it; delete needs 0."),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export type ConstructionHrmsSalaryStructureResponseModel = z.infer<
  typeof ConstructionHrmsSalaryStructureResponseModel
>;

export const ListConstructionHrmsSalaryStructuresResponseModel = z.object({
  items: z.array(ConstructionHrmsSalaryStructureResponseModel),
});

export type ListConstructionHrmsSalaryStructuresResponseModel = z.infer<
  typeof ListConstructionHrmsSalaryStructuresResponseModel
>;

export const CreateConstructionHrmsSalaryStructureRequestModel = z.object(
  salaryStructureSaveFields,
);

export type CreateConstructionHrmsSalaryStructureRequestModel = z.input<
  typeof CreateConstructionHrmsSalaryStructureRequestModel
>;

export const UpdateConstructionHrmsSalaryStructureRequestModel = z.object({
  ...salaryStructureSaveFields,
  expectedUpdatedAt: z.iso
    .datetime()
    .describe(
      "The `updatedAt` you loaded. A mismatch is 409 SALARY_STRUCTURE_CHANGED.",
    ),
});

export type UpdateConstructionHrmsSalaryStructureRequestModel = z.input<
  typeof UpdateConstructionHrmsSalaryStructureRequestModel
>;

export const DeleteConstructionHrmsSalaryStructureRequestModel = z.object({
  expectedUpdatedAt: z.iso
    .datetime()
    .describe(
      "The `updatedAt` you loaded. A mismatch is 409 SALARY_STRUCTURE_CHANGED.",
    ),
});

export type DeleteConstructionHrmsSalaryStructureRequestModel = z.input<
  typeof DeleteConstructionHrmsSalaryStructureRequestModel
>;

export const ConstructionHrmsSalaryStructureParamsModel = z.object({
  id: z.uuid(),
});

export function toSalaryStructureResponse(
  stored: StoredSalaryStructure,
): ConstructionHrmsSalaryStructureResponseModel {
  const { structure } = stored;
  return {
    id: stored.id,
    name: structure.name,
    description: structure.description,
    components: structure.components.map((component) => ({
      id: component.id,
      name: component.name,
      basis: component.basis,
      amount: component.amount,
      percent: component.percent,
      isBalancing: component.isBalancing,
      countsForPfWage: component.countsForPfWage,
    })),
    pf: { ...structure.pf },
    esi: { ...structure.esi },
    pt: { ...structure.pt },
    deductAbsentDays: structure.deductAbsentDays,
    deductUnpaidLeave: structure.deductUnpaidLeave,
    otherDeductions: structure.otherDeductions.map((deduction) => ({
      ...deduction,
    })),
    isActive: structure.isActive,
    membersUsing: stored.membersUsing,
    createdAt: stored.createdAt.toISOString(),
    updatedAt: stored.updatedAt.toISOString(),
  };
}
