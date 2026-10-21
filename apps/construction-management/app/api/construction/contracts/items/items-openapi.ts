import { StatusCodes } from "http-status-codes";

import type {
  OpenApiComponents,
  OpenApiOperation,
} from "@/app/api/_lib/openapi";
import { XLSX_CONTENT_TYPE } from "@/src/contracts/infrastructure/item-workbook";

import {
  ConstructionContractsItemFormOptionsResponseModel,
  ConstructionContractsItemParamsModel,
  ConstructionContractsItemResponseModel,
  CreateConstructionContractsItemRequestModel,
  DeleteConstructionContractsItemRequestModel,
  ExportConstructionContractsItemsRequestModel,
  ImportConstructionContractsItemsResponseModel,
  ITEMS_PATH,
  ListConstructionContractsItemMaterialOptionsRequestModel,
  ListConstructionContractsItemMaterialOptionsResponseModel,
  ListConstructionContractsItemSchedulesResponseModel,
  ListConstructionContractsItemsRequestModel,
  ListConstructionContractsItemsResponseModel,
  UpdateConstructionContractsItemRequestModel,
} from "./item-models";

const TAGS = ["Construction · Contracts"];

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

const ITEM = `${ITEMS_PATH}/{id}`;

/** The Item Library's models (CM-1102). */
export const contractsItemsOpenApiComponents: OpenApiComponents = {
  CreateConstructionContractsItemRequestModel,
  UpdateConstructionContractsItemRequestModel,
  DeleteConstructionContractsItemRequestModel,
  ConstructionContractsItemResponseModel,
  ListConstructionContractsItemsResponseModel,
  ListConstructionContractsItemSchedulesResponseModel,
  ImportConstructionContractsItemsResponseModel,
  ConstructionContractsItemFormOptionsResponseModel,
  ListConstructionContractsItemMaterialOptionsResponseModel,
};

/** Master records → Item Library, menu `contracts.items` (C R U D E I), ADR CM-0023 §3. */
export const contractsItemsOpenApiOperations: OpenApiOperation[] = [
  {
    method: "get",
    path: ITEMS_PATH,
    summary:
      "Items in code order, by code / description and schedule, with the caller's Item Library flags (CM-1102)",
    tags: TAGS,
    query: ListConstructionContractsItemsRequestModel,
    successStatus: StatusCodes.OK,
    successDescription: "A page of Items",
    successSchema: ListConstructionContractsItemsResponseModel,
    errors: READ_ERRORS,
  },
  {
    method: "post",
    path: ITEMS_PATH,
    summary:
      "Add an Item with its rate analysis (ITEM_CODE_TAKEN 409; ITEM_UOM_INVALID, SAC_HSN_INVALID, ANALYSIS_* 400)",
    tags: TAGS,
    body: CreateConstructionContractsItemRequestModel,
    successStatus: StatusCodes.CREATED,
    successDescription: "The Item",
    successSchema: ConstructionContractsItemResponseModel,
    errors: WRITE_ERRORS,
  },
  {
    method: "get",
    path: `${ITEMS_PATH}/schedules`,
    summary: "The schedules live Items carry, for the list's filter",
    tags: TAGS,
    successStatus: StatusCodes.OK,
    successDescription: "Schedules, A–Z",
    successSchema: ListConstructionContractsItemSchedulesResponseModel,
    errors: READ_ERRORS,
  },
  {
    method: "get",
    path: `${ITEMS_PATH}/form-options`,
    summary:
      "The Item form's UoMs, Labour Categories and Equipment (Item Library create or update)",
    tags: TAGS,
    successStatus: StatusCodes.OK,
    successDescription: "Picker options",
    successSchema: ConstructionContractsItemFormOptionsResponseModel,
    errors: READ_ERRORS,
  },
  {
    method: "get",
    path: `${ITEMS_PATH}/material-options`,
    summary:
      "Materials for a rate analysis line, with the suggested rate when the caller holds Materials Financial",
    tags: TAGS,
    query: ListConstructionContractsItemMaterialOptionsRequestModel,
    successStatus: StatusCodes.OK,
    successDescription: "Material options",
    successSchema: ListConstructionContractsItemMaterialOptionsResponseModel,
    errors: READ_ERRORS,
  },
  {
    method: "get",
    path: `${ITEMS_PATH}/sample`,
    summary:
      "The Item import sample (.xlsx) with two example rows (Import flag)",
    tags: TAGS,
    successStatus: StatusCodes.OK,
    successDescription: "The sample workbook",
    successBinaryContentTypes: [XLSX_CONTENT_TYPE],
    errors: READ_ERRORS,
  },
  {
    method: "post",
    path: `${ITEMS_PATH}/import`,
    summary:
      "Import Items from the filled sample by Code, all or none (IMPORT_HAS_ERRORS with details.errors [{ row, column, message }]; Import flag)",
    tags: TAGS,
    bodyBinaryContentTypes: [XLSX_CONTENT_TYPE],
    successStatus: StatusCodes.OK,
    successDescription: "How many Items were added and updated",
    successSchema: ImportConstructionContractsItemsResponseModel,
    errors: WRITE_ERRORS,
  },
  {
    method: "get",
    path: `${ITEMS_PATH}/export`,
    summary:
      "The Items of the current search and schedule as .xlsx in the sample's columns (Export flag)",
    tags: TAGS,
    query: ExportConstructionContractsItemsRequestModel,
    successStatus: StatusCodes.OK,
    successDescription: "The workbook",
    successBinaryContentTypes: [XLSX_CONTENT_TYPE],
    errors: READ_ERRORS,
  },
  {
    method: "get",
    path: ITEM,
    summary: "One live Item with its rate analysis lines",
    tags: TAGS,
    params: ConstructionContractsItemParamsModel,
    successStatus: StatusCodes.OK,
    successDescription: "The Item",
    successSchema: ConstructionContractsItemResponseModel,
    errors: READ_ERRORS,
  },
  {
    method: "post",
    path: `${ITEM}/update`,
    summary:
      "Save the Item form; the analysis lines are replaced (ITEM_CHANGED, ITEM_CODE_TAKEN 409)",
    tags: TAGS,
    params: ConstructionContractsItemParamsModel,
    body: UpdateConstructionContractsItemRequestModel,
    successStatus: StatusCodes.OK,
    successDescription: "The Item",
    successSchema: ConstructionContractsItemResponseModel,
    errors: WRITE_ERRORS,
  },
  {
    method: "post",
    path: `${ITEM}/delete`,
    summary:
      "Delete an Item, refused while a live BOQ item uses it (ITEM_IN_USE 409 with details.count)",
    tags: TAGS,
    params: ConstructionContractsItemParamsModel,
    body: DeleteConstructionContractsItemRequestModel,
    successStatus: StatusCodes.NO_CONTENT,
    successDescription: "Deleted",
    errors: WRITE_ERRORS,
  },
];
