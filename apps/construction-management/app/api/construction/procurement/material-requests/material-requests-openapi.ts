import { StatusCodes } from "http-status-codes";

import type {
  OpenApiComponents,
  OpenApiOperation,
} from "@/app/api/_lib/openapi";

import {
  PROCUREMENT_TAGS,
  READ_ERRORS,
  WRITE_ERRORS,
} from "../stores/stores-openapi";
import {
  CloseConstructionProcurementMaterialRequestRequestModel,
  ConstructionProcurementMaterialRequestParamsModel,
  ConstructionProcurementMaterialRequestResponseModel,
  CreateConstructionProcurementMaterialRequestRequestModel,
  DeleteConstructionProcurementMaterialRequestRequestModel,
  GetConstructionProcurementMaterialRequestFormOptionsRequestModel,
  GetConstructionProcurementMaterialRequestFormOptionsResponseModel,
  ListConstructionProcurementMaterialRequestsRequestModel,
  ListConstructionProcurementMaterialRequestsResponseModel,
  MATERIAL_REQUESTS_PATH,
  UpdateConstructionProcurementMaterialRequestRequestModel,
} from "./material-request-models";

const ITEM = `${MATERIAL_REQUESTS_PATH}/{id}`;

/** Request and Response models of `/api/construction/procurement/material-requests` (M5). */
export const materialRequestOpenApiComponents: OpenApiComponents = {
  CreateConstructionProcurementMaterialRequestRequestModel,
  UpdateConstructionProcurementMaterialRequestRequestModel,
  DeleteConstructionProcurementMaterialRequestRequestModel,
  CloseConstructionProcurementMaterialRequestRequestModel,
  ConstructionProcurementMaterialRequestResponseModel,
  ListConstructionProcurementMaterialRequestsResponseModel,
  GetConstructionProcurementMaterialRequestFormOptionsResponseModel,
};

/**
 * Operations of `/api/construction/procurement/material-requests` (CM-508;
 * menu `procurement.material_requests`, plus the member on the Project for
 * the Project side, or Central store read for the store side).
 */
export const materialRequestOpenApiOperations: OpenApiOperation[] = [
  {
    method: "get",
    path: MATERIAL_REQUESTS_PATH,
    summary:
      "Material Requests, newest first: a Project's (read, on the Project) or the stores' (read and Central store read)",
    tags: PROCUREMENT_TAGS,
    query: ListConstructionProcurementMaterialRequestsRequestModel,
    successStatus: StatusCodes.OK,
    successDescription: "A page of requests",
    successSchema: ListConstructionProcurementMaterialRequestsResponseModel,
    errors: READ_ERRORS,
  },
  {
    method: "post",
    path: MATERIAL_REQUESTS_PATH,
    summary:
      "Raise a Material Request to a store serving the Project (create, on the Project; STORE_NOT_ON_PROJECT, CONTRACTOR_NOT_ON_PROJECT, DEPARTMENT_DISABLED, MATERIAL_REQUEST_ITEMS_REQUIRED, QUANTITY_INVALID, DATE_IN_FUTURE 400; back-dated 403)",
    tags: PROCUREMENT_TAGS,
    body: CreateConstructionProcurementMaterialRequestRequestModel,
    successStatus: StatusCodes.CREATED,
    successDescription: "The request",
    successSchema: ConstructionProcurementMaterialRequestResponseModel,
    errors: WRITE_ERRORS,
  },
  {
    method: "get",
    path: `${MATERIAL_REQUESTS_PATH}/form-options`,
    summary:
      "Stores serving the Project, its active Contractors and enabled Departments (create or update, on the Project)",
    tags: PROCUREMENT_TAGS,
    query: GetConstructionProcurementMaterialRequestFormOptionsRequestModel,
    successStatus: StatusCodes.OK,
    successDescription: "Options",
    successSchema: GetConstructionProcurementMaterialRequestFormOptionsResponseModel,
    errors: READ_ERRORS,
  },
  {
    method: "get",
    path: ITEM,
    summary: "One Material Request with its lines and Delivery Notes",
    tags: PROCUREMENT_TAGS,
    params: ConstructionProcurementMaterialRequestParamsModel,
    successStatus: StatusCodes.OK,
    successDescription: "The request",
    successSchema: ConstructionProcurementMaterialRequestResponseModel,
    errors: READ_ERRORS,
  },
  {
    method: "post",
    path: `${ITEM}/update`,
    summary:
      "Edit a Material Request while it has no Delivery Note (update, on the Project; MATERIAL_REQUEST_CHANGED, MATERIAL_REQUEST_HAS_DELIVERY_NOTES, MATERIAL_REQUEST_CLOSED 409)",
    tags: PROCUREMENT_TAGS,
    params: ConstructionProcurementMaterialRequestParamsModel,
    body: UpdateConstructionProcurementMaterialRequestRequestModel,
    successStatus: StatusCodes.OK,
    successDescription: "The request",
    successSchema: ConstructionProcurementMaterialRequestResponseModel,
    errors: WRITE_ERRORS,
  },
  {
    method: "post",
    path: `${ITEM}/delete`,
    summary:
      "Delete a Material Request with no Delivery Note (delete, on the Project; MATERIAL_REQUEST_HAS_DELIVERY_NOTES 409)",
    tags: PROCUREMENT_TAGS,
    params: ConstructionProcurementMaterialRequestParamsModel,
    body: DeleteConstructionProcurementMaterialRequestRequestModel,
    successStatus: StatusCodes.NO_CONTENT,
    successDescription: "Deleted",
    errors: WRITE_ERRORS,
  },
  {
    method: "post",
    path: `${ITEM}/close`,
    summary:
      "Close: the store ends what is left, with a reason (approve; MATERIAL_REQUEST_NOT_OPEN, MATERIAL_REQUEST_HAS_OPEN_DELIVERY_NOTES 409)",
    tags: PROCUREMENT_TAGS,
    params: ConstructionProcurementMaterialRequestParamsModel,
    body: CloseConstructionProcurementMaterialRequestRequestModel,
    successStatus: StatusCodes.OK,
    successDescription: "The closed request",
    successSchema: ConstructionProcurementMaterialRequestResponseModel,
    errors: WRITE_ERRORS,
  },
  {
    method: "get",
    path: `${ITEM}/pdf`,
    summary: "Export Material Request as a PDF (print)",
    tags: PROCUREMENT_TAGS,
    params: ConstructionProcurementMaterialRequestParamsModel,
    successStatus: StatusCodes.OK,
    successDescription: "The PDF",
    successBinaryContentTypes: ["application/pdf"],
    errors: READ_ERRORS,
  },
];
