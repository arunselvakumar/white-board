import { z } from "zod";

import type {
  ProjectEmployeeChoice,
  ProjectEmployeeLine,
} from "@/src/labour/application/employee-ports";

const date = z.iso.date();

export const ConstructionProjectsProjectEmployeeParamsModel = z.object({
  id: z.uuid(),
  employeeId: z.uuid(),
});

const roleModel = z
  .object({ id: z.uuid(), name: z.string() })
  .describe("Their Role (ADR CM-0055 §2).");

const categoryModel = z
  .object({ id: z.uuid(), name: z.string() })
  .nullable()
  .describe("Their Labour Category, when they have one.");

/** An Employee on the Project (ADR CM-0038 §2, CM-0055 §5). */
export const ConstructionProjectsProjectEmployeeResponseModel = z.object({
  id: z.uuid(),
  name: z.string(),
  employeeCode: z.string().nullable().describe("The Company's Employee Id."),
  role: roleModel,
  labourCategory: categoryModel,
  since: date.describe("Their first day on this Project."),
  isActive: z.boolean(),
});
export type ConstructionProjectsProjectEmployeeResponseModel = z.infer<
  typeof ConstructionProjectsProjectEmployeeResponseModel
>;

export const ListConstructionProjectsProjectEmployeesRequestModel = z
  .object({
    limit: z.coerce.number().int().min(1).max(100).optional().default(50),
    after: z.string().min(1).optional(),
    before: z.string().min(1).optional(),
    search: z
      .string()
      .trim()
      .max(100)
      .optional()
      .describe("Name, Employee Id, father's name or mobile."),
  })
  .refine((value) => value.after == null || value.before == null, {
    message: "after and before are mutually exclusive.",
    path: ["after"],
  });

/** The Project's Employees by name, with cursors both ways and the total (ADR-0020). */
export const ListConstructionProjectsProjectEmployeesResponseModel = z.object({
  items: z.array(ConstructionProjectsProjectEmployeeResponseModel),
  nextCursor: z.string().nullable(),
  prevCursor: z.string().nullable(),
  total: z.int(),
});
export type ListConstructionProjectsProjectEmployeesResponseModel = z.infer<
  typeof ListConstructionProjectsProjectEmployeesResponseModel
>;

export const ListConstructionProjectsProjectEmployeeOptionsRequestModel =
  z.object({
    search: z
      .string()
      .trim()
      .max(100)
      .optional()
      .describe("Name, Employee Id, father's name or mobile."),
    limit: z.coerce.number().int().min(1).max(500).optional().default(100),
  });

export const ConstructionProjectsProjectEmployeeOptionResponseModel = z.object({
  id: z.uuid(),
  name: z.string(),
  employeeCode: z.string().nullable(),
  role: roleModel,
  labourCategory: categoryModel,
  joiningDate: date.describe("The earliest From date they can be added on."),
});

/** Active Employees not on the Project, by name, for Add Employees. */
export const ListConstructionProjectsProjectEmployeeOptionsResponseModel =
  z.object({
    items: z.array(ConstructionProjectsProjectEmployeeOptionResponseModel),
    hasMore: z
      .boolean()
      .describe("More match than `limit`: search to narrow the list."),
  });
export type ListConstructionProjectsProjectEmployeeOptionsResponseModel =
  z.infer<typeof ListConstructionProjectsProjectEmployeeOptionsResponseModel>;

const remark = z
  .string()
  .max(2000)
  .nullable()
  .optional()
  .describe(
    "Kept on each history row; at most 500 characters once trimmed (400 REMARK_TOO_LONG).",
  );

/** Checked by the labour context, so a bad date is a field error. */
const requestDate = z.string().max(20).nullable().optional();

/** Adds Employees to the Project from a date; all or none. */
export const AddConstructionProjectsProjectEmployeesRequestModel = z.object({
  employeeIds: z.array(z.uuid()).min(1).max(500),
  from: requestDate.describe(
    "YYYY-MM-DD, their first day on the Project; today in the Company's time zone when left out.",
  ),
  remark,
});
export type AddConstructionProjectsProjectEmployeesRequestModel = z.infer<
  typeof AddConstructionProjectsProjectEmployeesRequestModel
>;

/** Takes an Employee off the Project after their Last day. */
export const RemoveConstructionProjectsProjectEmployeeRequestModel = z.object({
  lastDay: requestDate.describe(
    "YYYY-MM-DD, their last day on the Project; today in the Company's time zone when left out. The history row is dated the day after.",
  ),
  remark,
});
export type RemoveConstructionProjectsProjectEmployeeRequestModel = z.infer<
  typeof RemoveConstructionProjectsProjectEmployeeRequestModel
>;

export function toProjectEmployeeResponse(
  item: ProjectEmployeeLine,
): ConstructionProjectsProjectEmployeeResponseModel {
  return {
    id: item.id,
    name: item.name,
    employeeCode: item.employeeCode,
    role: item.role,
    labourCategory: item.labourCategory,
    since: item.since,
    isActive: item.isActive,
  };
}

export function toProjectEmployeeOptionsResponse(page: {
  items: readonly ProjectEmployeeChoice[];
  hasMore: boolean;
}): ListConstructionProjectsProjectEmployeeOptionsResponseModel {
  return {
    items: page.items.map((item) => ({
      id: item.id,
      name: item.name,
      employeeCode: item.employeeCode,
      role: item.role,
      labourCategory: item.labourCategory,
      joiningDate: item.joiningDate,
    })),
    hasMore: page.hasMore,
  };
}
