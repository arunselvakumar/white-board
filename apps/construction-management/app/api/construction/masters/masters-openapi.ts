import { StatusCodes } from "http-status-codes";
import type { z } from "zod";

import type {
  OpenApiComponents,
  OpenApiOperation,
} from "@/app/api/_lib/openapi";

import {
  ConstructionMastersIdParamsModel,
  ListConstructionMastersQueryModel,
} from "./_lib/master-models";
import {
  ConstructionMastersDepartmentResponseModel,
  CreateConstructionMastersDepartmentRequestModel,
  ListConstructionMastersDepartmentsResponseModel,
  UpdateConstructionMastersDepartmentRequestModel,
} from "./departments/department-models";
import {
  ConstructionMastersLabourCategoryResponseModel,
  CreateConstructionMastersLabourCategoryRequestModel,
  ListConstructionMastersLabourCategoriesResponseModel,
  UpdateConstructionMastersLabourCategoryRequestModel,
} from "./labour-categories/labour-category-models";
import {
  ConstructionMastersSupervisorResponseModel,
  CreateConstructionMastersSupervisorRequestModel,
  ListConstructionMastersSupervisorsResponseModel,
  UpdateConstructionMastersSupervisorRequestModel,
} from "./supervisors/supervisor-models";

export const MASTERS = ["Construction · Masters"];

/** The masters context's Request and Response models (CM-203). */
export const mastersOpenApiComponents: OpenApiComponents = {
  ListConstructionMastersLabourCategoriesResponseModel,
  ConstructionMastersLabourCategoryResponseModel,
  CreateConstructionMastersLabourCategoryRequestModel,
  UpdateConstructionMastersLabourCategoryRequestModel,
  ListConstructionMastersDepartmentsResponseModel,
  ConstructionMastersDepartmentResponseModel,
  CreateConstructionMastersDepartmentRequestModel,
  UpdateConstructionMastersDepartmentRequestModel,
  ListConstructionMastersSupervisorsResponseModel,
  ConstructionMastersSupervisorResponseModel,
  CreateConstructionMastersSupervisorRequestModel,
  UpdateConstructionMastersSupervisorRequestModel,
};

export const SESSION = [
  StatusCodes.UNAUTHORIZED,
  StatusCodes.FORBIDDEN,
] as const;
export const WRITE = [
  StatusCodes.BAD_REQUEST,
  ...SESSION,
  StatusCodes.PAYMENT_REQUIRED,
] as const;

export function masterOperations(input: {
  path: string;
  label: string;
  plural: string;
  menu: string;
  inUse: string;
  list: z.ZodType;
  item: z.ZodType;
  create: z.ZodType;
  update: z.ZodType;
}): OpenApiOperation[] {
  const { path, label, plural, menu } = input;
  const params = ConstructionMastersIdParamsModel;
  return [
    {
      method: "get",
      path,
      summary: `Every live ${label} of the Active Company by name, disabled ones included unless \`status=enabled\` (menu \`${menu}\`, read)`,
      tags: MASTERS,
      query: ListConstructionMastersQueryModel,
      successStatus: StatusCodes.OK,
      successDescription: plural,
      successSchema: input.list,
      errors: [StatusCodes.BAD_REQUEST, ...SESSION],
    },
    {
      method: "post",
      path,
      summary: `Add a ${label} (409 when a live one has the name)`,
      tags: MASTERS,
      body: input.create,
      successStatus: StatusCodes.CREATED,
      successDescription: `The new ${label}`,
      successSchema: input.item,
      errors: [...WRITE, StatusCodes.CONFLICT],
    },
    {
      method: "get",
      path: `${path}/{id}`,
      summary: `One ${label}, enabled or disabled`,
      tags: MASTERS,
      params,
      successStatus: StatusCodes.OK,
      successDescription: `The ${label}`,
      successSchema: input.item,
      errors: [StatusCodes.BAD_REQUEST, ...SESSION, StatusCodes.NOT_FOUND],
    },
    {
      method: "post",
      path: `${path}/{id}/update`,
      summary: `Change a ${label} with the \`updatedAt\` you loaded (409 when stale, when the name is taken, or for a seed row)`,
      tags: MASTERS,
      params,
      body: input.update,
      successStatus: StatusCodes.OK,
      successDescription: `The updated ${label}`,
      successSchema: input.item,
      errors: [...WRITE, StatusCodes.NOT_FOUND, StatusCodes.CONFLICT],
    },
    {
      method: "post",
      path: `${path}/{id}/disable`,
      summary: `Take a ${label} off the pickers; old records keep it (seed rows too)`,
      tags: MASTERS,
      params,
      successStatus: StatusCodes.OK,
      successDescription: `The disabled ${label}`,
      successSchema: input.item,
      errors: [...WRITE, StatusCodes.NOT_FOUND, StatusCodes.CONFLICT],
    },
    {
      method: "post",
      path: `${path}/{id}/enable`,
      summary: `Put a disabled ${label} back on the pickers`,
      tags: MASTERS,
      params,
      successStatus: StatusCodes.OK,
      successDescription: `The enabled ${label}`,
      successSchema: input.item,
      errors: [...WRITE, StatusCodes.NOT_FOUND, StatusCodes.CONFLICT],
    },
    {
      method: "post",
      path: `${path}/{id}/delete`,
      summary: `Delete a Company-made ${label} (a tombstone). ${input.inUse}`,
      tags: MASTERS,
      params,
      successStatus: StatusCodes.NO_CONTENT,
      successDescription: "Deleted",
      errors: [...WRITE, StatusCodes.NOT_FOUND, StatusCodes.CONFLICT],
    },
  ];
}

const BASE = "/api/construction/masters";

/** Every masters route (root ADR-0012). */
export const mastersOpenApiOperations: OpenApiOperation[] = [
  ...masterOperations({
    path: `${BASE}/labour-categories`,
    label: "Labour Category",
    plural: "Labour Categories",
    menu: "masters.labour_categories",
    inUse:
      "409 SEED_IS_READ_ONLY for a seed row, LABOUR_CATEGORY_IN_USE while Labours, rate cards or attendance use it.",
    list: ListConstructionMastersLabourCategoriesResponseModel,
    item: ConstructionMastersLabourCategoryResponseModel,
    create: CreateConstructionMastersLabourCategoryRequestModel,
    update: UpdateConstructionMastersLabourCategoryRequestModel,
  }),
  ...masterOperations({
    path: `${BASE}/departments`,
    label: "Department",
    plural: "Departments",
    menu: "masters.departments",
    inUse: "409 SEED_IS_READ_ONLY for a seed row.",
    list: ListConstructionMastersDepartmentsResponseModel,
    item: ConstructionMastersDepartmentResponseModel,
    create: CreateConstructionMastersDepartmentRequestModel,
    update: UpdateConstructionMastersDepartmentRequestModel,
  }),
  ...masterOperations({
    path: `${BASE}/supervisors`,
    label: "Supervisor",
    plural: "Supervisors",
    menu: "masters.labours",
    inUse: "409 SUPERVISOR_IN_USE while Labours or attendance name them.",
    list: ListConstructionMastersSupervisorsResponseModel,
    item: ConstructionMastersSupervisorResponseModel,
    create: CreateConstructionMastersSupervisorRequestModel,
    update: UpdateConstructionMastersSupervisorRequestModel,
  }),
];
