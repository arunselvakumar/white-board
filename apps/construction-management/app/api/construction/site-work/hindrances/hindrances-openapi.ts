import { StatusCodes } from "http-status-codes";

import type {
  OpenApiComponents,
  OpenApiOperation,
} from "@/app/api/_lib/openapi";

import {
  CloseConstructionSiteWorkHindranceRequestModel,
  ConstructionSiteWorkHindranceActionsResponseModel,
  ConstructionSiteWorkHindranceParamsModel,
  ConstructionSiteWorkHindranceResponseModel,
  CreateConstructionSiteWorkHindranceRequestModel,
  DeleteConstructionSiteWorkHindranceRequestModel,
  GetConstructionSiteWorkHindranceFormOptionsRequestModel,
  GetConstructionSiteWorkHindranceFormOptionsResponseModel,
  HINDRANCES_PATH,
  ListConstructionSiteWorkHindrancesRequestModel,
  ListConstructionSiteWorkHindrancesResponseModel,
  UpdateConstructionSiteWorkHindranceRequestModel,
} from "./hindrance-models";

const TAGS = ["Construction · Site work"];

const READ_ERRORS = [
  StatusCodes.BAD_REQUEST,
  StatusCodes.UNAUTHORIZED,
  StatusCodes.FORBIDDEN,
  StatusCodes.NOT_FOUND,
];

const WRITE_ERRORS = [
  ...READ_ERRORS,
  StatusCodes.CONFLICT,
  StatusCodes.PAYMENT_REQUIRED,
];

const ITEM = `${HINDRANCES_PATH}/{id}`;

/** Request and Response models of `/api/construction/site-work/hindrances` (CM-607). */
export const hindranceOpenApiComponents: OpenApiComponents = {
  CreateConstructionSiteWorkHindranceRequestModel,
  UpdateConstructionSiteWorkHindranceRequestModel,
  CloseConstructionSiteWorkHindranceRequestModel,
  DeleteConstructionSiteWorkHindranceRequestModel,
  ConstructionSiteWorkHindranceActionsResponseModel,
  ConstructionSiteWorkHindranceResponseModel,
  ListConstructionSiteWorkHindrancesResponseModel,
  GetConstructionSiteWorkHindranceFormOptionsResponseModel,
};

/**
 * Hindrance register routes (CM-607), menu `site_work.hindrances` on the
 * hindrance's Project: read, create, update (edit, Close), delete.
 */
export const hindranceOpenApiOperations: OpenApiOperation[] = [
  {
    method: "get",
    path: HINDRANCES_PATH,
    summary: "A Project's Hindrance register, newest first, with filters",
    tags: TAGS,
    query: ListConstructionSiteWorkHindrancesRequestModel,
    successStatus: StatusCodes.OK,
    successDescription: "A page of hindrances",
    successSchema: ListConstructionSiteWorkHindrancesResponseModel,
    errors: READ_ERRORS,
  },
  {
    method: "post",
    path: HINDRANCES_PATH,
    summary: "Record a hindrance",
    tags: TAGS,
    body: CreateConstructionSiteWorkHindranceRequestModel,
    successStatus: StatusCodes.CREATED,
    successDescription: "The new hindrance",
    successSchema: ConstructionSiteWorkHindranceResponseModel,
    errors: WRITE_ERRORS,
  },
  {
    method: "get",
    path: `${HINDRANCES_PATH}/form-options`,
    summary: "Contractors on the Project and the Team Members who may sign off",
    tags: TAGS,
    query: GetConstructionSiteWorkHindranceFormOptionsRequestModel,
    successStatus: StatusCodes.OK,
    successDescription: "The form's options",
    successSchema: GetConstructionSiteWorkHindranceFormOptionsResponseModel,
    errors: READ_ERRORS,
  },
  {
    method: "get",
    path: ITEM,
    summary: "One hindrance",
    tags: TAGS,
    params: ConstructionSiteWorkHindranceParamsModel,
    successStatus: StatusCodes.OK,
    successDescription: "The hindrance",
    successSchema: ConstructionSiteWorkHindranceResponseModel,
    errors: READ_ERRORS,
  },
  {
    method: "post",
    path: `${ITEM}/update`,
    summary: "Edit a hindrance",
    tags: TAGS,
    params: ConstructionSiteWorkHindranceParamsModel,
    body: UpdateConstructionSiteWorkHindranceRequestModel,
    successStatus: StatusCodes.OK,
    successDescription: "The saved hindrance",
    successSchema: ConstructionSiteWorkHindranceResponseModel,
    errors: WRITE_ERRORS,
  },
  {
    method: "post",
    path: `${ITEM}/close`,
    summary: "Close an open hindrance: its end date and hours lost",
    tags: TAGS,
    params: ConstructionSiteWorkHindranceParamsModel,
    body: CloseConstructionSiteWorkHindranceRequestModel,
    successStatus: StatusCodes.OK,
    successDescription: "The closed hindrance",
    successSchema: ConstructionSiteWorkHindranceResponseModel,
    errors: WRITE_ERRORS,
  },
  {
    method: "post",
    path: `${ITEM}/delete`,
    summary: "Delete a hindrance",
    tags: TAGS,
    params: ConstructionSiteWorkHindranceParamsModel,
    body: DeleteConstructionSiteWorkHindranceRequestModel,
    successStatus: StatusCodes.NO_CONTENT,
    successDescription: "Deleted",
    errors: WRITE_ERRORS,
  },
];
