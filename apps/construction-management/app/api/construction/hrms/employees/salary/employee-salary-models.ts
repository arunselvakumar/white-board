import { z } from "zod";

import type { EmployeeSalaryRow } from "@/src/hrms/application/employee-salary-handlers";
import type { StoredSalaryStructure } from "@/src/hrms/application/salary-structure-handlers";
import { GENDERS } from "@/src/hrms/domain/employee-salary";
import { COMPONENT_BASES } from "@/src/hrms/domain/salary-structure";

/**
 * Employee salary configuration models (CM-315). Amounts (base salary and
 * component overrides) are null in responses without `hrms.employees`
 * financial; entering them needs financial too.
 */

const override = z.union([
  z.object({ amount: z.number().int().describe("Paise a month.") }),
  z.object({ percent: z.string().describe("Percentage of the base salary.") }),
]);

const overrides = z
  .record(z.string(), override)
  .describe(
    "A member's own amount per component id; the balancing component cannot be set.",
  );

export const ConstructionHrmsEmployeeSalaryRowModel = z.object({
  memberId: z.uuid(),
  name: z.string(),
  memberType: z.enum(["normal", "hrms"]),
  designationName: z.string().nullable(),
  /** Joined; a Joining Pending member is not yet active. */
  active: z.boolean(),
  status: z
    .enum(["configured", "not_set"])
    .describe("Configured once the member has a salary configuration."),
  config: z
    .object({
      id: z.uuid(),
      structureId: z.uuid(),
      structureName: z.string().nullable(),
      baseMonthly: z
        .number()
        .int()
        .nullable()
        .describe("Paise a month; null without `hrms.employees` financial."),
      componentOverrides: overrides
        .nullable()
        .describe("Null without `hrms.employees` financial."),
      gender: z.enum(GENDERS).nullable(),
      uan: z.string().nullable().describe("12 digits."),
      esiIpNumber: z.string().nullable().describe("10 digits."),
      effectiveFrom: z.string().describe("`YYYY-MM-DD`."),
      updatedAt: z.iso.datetime(),
    })
    .nullable(),
});

export type ConstructionHrmsEmployeeSalaryRowModel = z.infer<
  typeof ConstructionHrmsEmployeeSalaryRowModel
>;

export const ListConstructionHrmsEmployeeSalariesResponseModel = z.object({
  items: z.array(ConstructionHrmsEmployeeSalaryRowModel),
  structures: z
    .array(
      z.object({
        id: z.uuid(),
        name: z.string(),
        isActive: z.boolean(),
        components: z.array(
          z.object({
            id: z.uuid(),
            name: z.string(),
            basis: z.enum(COMPONENT_BASES),
            isBalancing: z.boolean(),
          }),
        ),
      }),
    )
    .describe("Live salary structures for the picker."),
  financial: z
    .boolean()
    .describe(
      "Whether you can see and enter amounts (`hrms.employees` financial).",
    ),
});

export type ListConstructionHrmsEmployeeSalariesResponseModel = z.infer<
  typeof ListConstructionHrmsEmployeeSalariesResponseModel
>;

export const SaveConstructionHrmsEmployeeSalariesRequestModel = z.object({
  rows: z
    .array(
      z.object({
        memberId: z.uuid(),
        structureId: z.uuid(),
        baseMonthly: z
          .number()
          .int()
          .nullable()
          .describe(
            "Paise a month; null keeps the stored amount. Needs financial.",
          ),
        componentOverrides: overrides
          .nullable()
          .describe(
            "Null keeps the stored overrides (none when the structure changes). Needs financial.",
          ),
        gender: z.enum(GENDERS).nullable(),
        uan: z.string().max(20).nullable(),
        esiIpNumber: z.string().max(20).nullable(),
        effectiveFrom: z
          .string()
          .describe("`YYYY-MM-DD`; on or after the member's current start."),
        expectedUpdatedAt: z.iso
          .datetime()
          .nullable()
          .describe(
            "The member's `config.updatedAt` you loaded; null when Not Set. A mismatch is 409 EMPLOYEE_SALARY_CHANGED.",
          ),
      }),
    )
    .describe("Only the rows you changed (Save All sends the dirty rows)."),
});

export type SaveConstructionHrmsEmployeeSalariesRequestModel = z.input<
  typeof SaveConstructionHrmsEmployeeSalariesRequestModel
>;

export const SaveConstructionHrmsEmployeeSalariesResponseModel = z.object({
  items: z.array(ConstructionHrmsEmployeeSalaryRowModel),
});

export type SaveConstructionHrmsEmployeeSalariesResponseModel = z.infer<
  typeof SaveConstructionHrmsEmployeeSalariesResponseModel
>;

export function toEmployeeSalaryRow(
  row: EmployeeSalaryRow,
  financial: boolean,
): ConstructionHrmsEmployeeSalaryRowModel {
  const { employee, stored } = row;
  return {
    memberId: employee.memberId,
    name: employee.name,
    memberType: employee.memberType,
    designationName: employee.designationName,
    active: employee.active,
    status: stored == null ? "not_set" : "configured",
    config:
      stored == null
        ? null
        : {
            id: stored.id,
            structureId: stored.config.structureId,
            structureName: row.structureName,
            baseMonthly: financial ? stored.config.baseMonthly : null,
            componentOverrides: financial
              ? { ...stored.config.componentOverrides }
              : null,
            gender: stored.config.gender,
            uan: stored.config.uan,
            esiIpNumber: stored.config.esiIpNumber,
            effectiveFrom: stored.config.effectiveFrom,
            updatedAt: stored.updatedAt.toISOString(),
          },
  };
}

export function toStructureOption(
  stored: StoredSalaryStructure,
): ListConstructionHrmsEmployeeSalariesResponseModel["structures"][number] {
  return {
    id: stored.id,
    name: stored.structure.name,
    isActive: stored.structure.isActive,
    components: stored.structure.components.map((component) => ({
      id: component.id,
      name: component.name,
      basis: component.basis,
      isBalancing: component.isBalancing,
    })),
  };
}
