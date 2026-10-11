import { StatusCodes } from "http-status-codes";

import type {
  OpenApiComponents,
  OpenApiOperation,
} from "@/app/api/_lib/openapi";

import {
  ConstructionMastersIdParamsModel,
  ListConstructionMastersQueryModel,
} from "../_lib/master-models";
import {
  ConstructionMastersWorkTypeResponseModel,
  CreateConstructionMastersWorkTypeRequestModel,
  ListConstructionMastersWorkTypesResponseModel,
  UpdateConstructionMastersWorkTypeRequestModel,
} from "./work-type-models";

const TAGS = ["Construction · Masters"];
const PATH = "/api/construction/masters/work-types";
const SESSION = [StatusCodes.UNAUTHORIZED, StatusCodes.FORBIDDEN];
const WRITE = [
  StatusCodes.BAD_REQUEST,
  ...SESSION,
  StatusCodes.PAYMENT_REQUIRED,
];
const params = ConstructionMastersIdParamsModel;

/** Work Types' Request and Response models (CM-601). */
export const workTypeOpenApiComponents: OpenApiComponents = {
  ListConstructionMastersWorkTypesResponseModel,
  ConstructionMastersWorkTypeResponseModel,
  CreateConstructionMastersWorkTypeRequestModel,
  UpdateConstructionMastersWorkTypeRequestModel,
};

/** `/api/construction/masters/work-types` (CM-601, menu `masters.work_types`). */
export const workTypeOpenApiOperations: OpenApiOperation[] = [
  {
    method: "get",
    path: PATH,
    summary:
      "Every live Work Type of the Active Company by name, with its Department and Materials; disabled ones included unless `status=enabled` (menu `masters.work_types`, read)",
    tags: TAGS,
    query: ListConstructionMastersQueryModel,
    successStatus: StatusCodes.OK,
    successDescription: "Work Types",
    successSchema: ListConstructionMastersWorkTypesResponseModel,
    errors: [StatusCodes.BAD_REQUEST, ...SESSION],
  },
  {
    method: "post",
    path: PATH,
    summary:
      "Add a Work Type under a Department, with its Materials (409 WORK_TYPE_NAME_IN_USE when a live one has the name)",
    tags: TAGS,
    body: CreateConstructionMastersWorkTypeRequestModel,
    successStatus: StatusCodes.CREATED,
    successDescription: "The new Work Type",
    successSchema: ConstructionMastersWorkTypeResponseModel,
    errors: [...WRITE, StatusCodes.CONFLICT],
  },
  {
    method: "get",
    path: `${PATH}/{id}`,
    summary: "One Work Type, enabled or disabled",
    tags: TAGS,
    params,
    successStatus: StatusCodes.OK,
    successDescription: "The Work Type",
    successSchema: ConstructionMastersWorkTypeResponseModel,
    errors: [StatusCodes.BAD_REQUEST, ...SESSION, StatusCodes.NOT_FOUND],
  },
  {
    method: "post",
    path: `${PATH}/{id}/update`,
    summary:
      "Change a Work Type's name, Department and Materials with the `updatedAt` you loaded (409 WORK_TYPE_CHANGED when stale, WORK_TYPE_NAME_IN_USE, SEED_IS_READ_ONLY when the seed's name or Department changes)",
    tags: TAGS,
    params,
    body: UpdateConstructionMastersWorkTypeRequestModel,
    successStatus: StatusCodes.OK,
    successDescription: "The updated Work Type",
    successSchema: ConstructionMastersWorkTypeResponseModel,
    errors: [...WRITE, StatusCodes.NOT_FOUND, StatusCodes.CONFLICT],
  },
  {
    method: "post",
    path: `${PATH}/{id}/disable`,
    summary:
      "Take a Work Type off the pickers; old worksheets keep it (the seed too)",
    tags: TAGS,
    params,
    successStatus: StatusCodes.OK,
    successDescription: "The disabled Work Type",
    successSchema: ConstructionMastersWorkTypeResponseModel,
    errors: [...WRITE, StatusCodes.NOT_FOUND, StatusCodes.CONFLICT],
  },
  {
    method: "post",
    path: `${PATH}/{id}/enable`,
    summary: "Put a disabled Work Type back on the pickers",
    tags: TAGS,
    params,
    successStatus: StatusCodes.OK,
    successDescription: "The enabled Work Type",
    successSchema: ConstructionMastersWorkTypeResponseModel,
    errors: [...WRITE, StatusCodes.NOT_FOUND, StatusCodes.CONFLICT],
  },
  {
    method: "post",
    path: `${PATH}/{id}/delete`,
    summary:
      "Delete a Company-made Work Type (a tombstone). 409 SEED_IS_READ_ONLY for the seed, WORK_TYPE_IN_USE while a live Daily Worksheet names it",
    tags: TAGS,
    params,
    successStatus: StatusCodes.NO_CONTENT,
    successDescription: "Deleted",
    errors: [...WRITE, StatusCodes.NOT_FOUND, StatusCodes.CONFLICT],
  },
];
