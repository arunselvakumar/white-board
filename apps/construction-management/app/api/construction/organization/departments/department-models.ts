import { z } from "zod";

import type { DepartmentReadModel } from "@/src/organization/application/department-handlers";

export const DEPARTMENTS_PATH = "/api/construction/organization/departments";

export const ConstructionOrganizationDepartmentParamsModel = z.object({
  id: z.uuid(),
});

export const ConstructionOrganizationDepartmentResponseModel = z.object({
  id: z.uuid(),
  name: z.string(),
  isSystem: z
    .boolean()
    .describe(
      "Human Resources and Marketing: the name is fixed and they cannot be deleted",
    ),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export type ConstructionOrganizationDepartmentResponseModel = z.infer<
  typeof ConstructionOrganizationDepartmentResponseModel
>;

export const ListConstructionOrganizationDepartmentsResponseModel = z.object({
  items: z.array(ConstructionOrganizationDepartmentResponseModel),
});

export type ListConstructionOrganizationDepartmentsResponseModel = z.infer<
  typeof ListConstructionOrganizationDepartmentsResponseModel
>;

/**
 * The name: trimmed, at most 100 characters (400
 * `DEPARTMENT_NAME_REQUIRED` / `DEPARTMENT_NAME_TOO_LONG`), unique among
 * the Company's live departments ignoring case (409
 * `DEPARTMENT_NAME_TAKEN`).
 */
const name = z.string().max(1000);

export const CreateConstructionOrganizationDepartmentRequestModel = z.object({
  name,
});

export type CreateConstructionOrganizationDepartmentRequestModel = z.infer<
  typeof CreateConstructionOrganizationDepartmentRequestModel
>;

export const UpdateConstructionOrganizationDepartmentRequestModel = z.object({
  name,
  expectedUpdatedAt: z.iso
    .datetime()
    .describe(
      "The `updatedAt` the screen loaded; 409 `STALE_DEPARTMENT` when someone saved the Department since",
    ),
});

export type UpdateConstructionOrganizationDepartmentRequestModel = z.infer<
  typeof UpdateConstructionOrganizationDepartmentRequestModel
>;

export function toDepartmentResponse(
  department: DepartmentReadModel,
): ConstructionOrganizationDepartmentResponseModel {
  return {
    ...department,
    createdAt: department.createdAt.toISOString(),
    updatedAt: department.updatedAt.toISOString(),
  };
}
