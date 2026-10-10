import { StatusCodes } from "http-status-codes";

import type {
  OpenApiComponents,
  OpenApiOperation,
} from "@/app/api/_lib/openapi";

import {
  ConstructionProcurementStoreParamsModel,
  ConstructionProcurementStoreResponseModel,
  CreateConstructionProcurementStoreRequestModel,
  DeleteConstructionProcurementStoreRequestModel,
  GetConstructionProcurementStoreFormOptionsResponseModel,
  GetConstructionProcurementStoreStockResponseModel,
  ListConstructionProcurementStoreOptionsRequestModel,
  ListConstructionProcurementStoreOptionsResponseModel,
  ListConstructionProcurementStoresRequestModel,
  ListConstructionProcurementStoresResponseModel,
  STORES_PATH,
  UpdateConstructionProcurementStoreRequestModel,
} from "./store-models";

export const PROCUREMENT_TAGS = ["Construction · Procurement"];

export const READ_ERRORS = [
  StatusCodes.BAD_REQUEST,
  StatusCodes.UNAUTHORIZED,
  StatusCodes.FORBIDDEN,
  StatusCodes.NOT_FOUND,
];

export const WRITE_ERRORS = [
  ...READ_ERRORS,
  StatusCodes.CONFLICT,
  StatusCodes.PAYMENT_REQUIRED,
];

const ITEM = `${STORES_PATH}/{id}`;

/** Request and Response models of `/api/construction/procurement/stores` (M5). */
export const storeOpenApiComponents: OpenApiComponents = {
  CreateConstructionProcurementStoreRequestModel,
  UpdateConstructionProcurementStoreRequestModel,
  DeleteConstructionProcurementStoreRequestModel,
  ConstructionProcurementStoreResponseModel,
  ListConstructionProcurementStoresResponseModel,
  GetConstructionProcurementStoreStockResponseModel,
  ListConstructionProcurementStoreOptionsResponseModel,
  GetConstructionProcurementStoreFormOptionsResponseModel,
};

/** Operations of `/api/construction/procurement/stores` (CM-508; menu `procurement.central_store`). */
export const storeOpenApiOperations: OpenApiOperation[] = [
  {
    method: "get",
    path: STORES_PATH,
    summary:
      "Central Stores, newest first, by name or Project (Central store read)",
    tags: PROCUREMENT_TAGS,
    query: ListConstructionProcurementStoresRequestModel,
    successStatus: StatusCodes.OK,
    successDescription: "A page of stores",
    successSchema: ListConstructionProcurementStoresResponseModel,
    errors: READ_ERRORS,
  },
  {
    method: "post",
    path: STORES_PATH,
    summary:
      "Create a store (Central store create; STORE_PROJECTS_REQUIRED, PROJECT_NOT_FOUND, TEAM_MEMBER_NOT_FOUND, SUPPLIER_NOT_FOUND, SUPPLIER_INACTIVE 400; STORE_NAME_TAKEN 409)",
    tags: PROCUREMENT_TAGS,
    body: CreateConstructionProcurementStoreRequestModel,
    successStatus: StatusCodes.CREATED,
    successDescription: "The store",
    successSchema: ConstructionProcurementStoreResponseModel,
    errors: WRITE_ERRORS,
  },
  {
    method: "get",
    path: `${STORES_PATH}/options`,
    summary:
      "Live stores for pickers, those serving a Project when given (read on any procurement menu that picks a store)",
    tags: PROCUREMENT_TAGS,
    query: ListConstructionProcurementStoreOptionsRequestModel,
    successStatus: StatusCodes.OK,
    successDescription: "Stores by name",
    successSchema: ListConstructionProcurementStoreOptionsResponseModel,
    errors: READ_ERRORS,
  },
  {
    method: "get",
    path: `${STORES_PATH}/form-options`,
    summary:
      "Projects, Team Members and Suppliers the store form offers (Central store create or update)",
    tags: PROCUREMENT_TAGS,
    successStatus: StatusCodes.OK,
    successDescription: "Options",
    successSchema: GetConstructionProcurementStoreFormOptionsResponseModel,
    errors: READ_ERRORS,
  },
  {
    method: "get",
    path: ITEM,
    summary: "One store (Central store read)",
    tags: PROCUREMENT_TAGS,
    params: ConstructionProcurementStoreParamsModel,
    successStatus: StatusCodes.OK,
    successDescription: "The store",
    successSchema: ConstructionProcurementStoreResponseModel,
    errors: READ_ERRORS,
  },
  {
    method: "post",
    path: `${ITEM}/update`,
    summary:
      "Edit a store (Central store update; STORE_CHANGED, STORE_NAME_TAKEN, STORE_PROJECT_IN_USE 409)",
    tags: PROCUREMENT_TAGS,
    params: ConstructionProcurementStoreParamsModel,
    body: UpdateConstructionProcurementStoreRequestModel,
    successStatus: StatusCodes.OK,
    successDescription: "The store",
    successSchema: ConstructionProcurementStoreResponseModel,
    errors: WRITE_ERRORS,
  },
  {
    method: "post",
    path: `${ITEM}/delete`,
    summary:
      "Delete a store (Central store delete; STORE_IN_USE 409 while it holds stock, has open Material Requests or undelivered Delivery Notes or transfers)",
    tags: PROCUREMENT_TAGS,
    params: ConstructionProcurementStoreParamsModel,
    body: DeleteConstructionProcurementStoreRequestModel,
    successStatus: StatusCodes.NO_CONTENT,
    successDescription: "Deleted",
    errors: WRITE_ERRORS,
  },
  {
    method: "get",
    path: `${ITEM}/stock`,
    summary:
      "The store's stock per material, with what is in transit to it and its stock state (Central store read)",
    tags: PROCUREMENT_TAGS,
    params: ConstructionProcurementStoreParamsModel,
    successStatus: StatusCodes.OK,
    successDescription: "Stock rows",
    successSchema: GetConstructionProcurementStoreStockResponseModel,
    errors: READ_ERRORS,
  },
];
