import type { z } from "zod";

import { lookupModels } from "../_lib/master-models";

const models = lookupModels("DEPARTMENT");

/** Departments' models (CM-203); every route of the list uses these. */
export const DEPARTMENT_MODELS = models;

export const ConstructionMastersDepartmentResponseModel = models.response;
export type ConstructionMastersDepartmentResponseModel = z.infer<
  typeof ConstructionMastersDepartmentResponseModel
>;

export const ListConstructionMastersDepartmentsResponseModel = models.list;
export type ListConstructionMastersDepartmentsResponseModel = z.infer<
  typeof ListConstructionMastersDepartmentsResponseModel
>;

export const CreateConstructionMastersDepartmentRequestModel = models.create;
export type CreateConstructionMastersDepartmentRequestModel = z.infer<
  typeof CreateConstructionMastersDepartmentRequestModel
>;

export const UpdateConstructionMastersDepartmentRequestModel = models.update;
export type UpdateConstructionMastersDepartmentRequestModel = z.infer<
  typeof UpdateConstructionMastersDepartmentRequestModel
>;
