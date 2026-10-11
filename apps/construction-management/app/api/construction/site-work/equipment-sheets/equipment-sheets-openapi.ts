import { StatusCodes } from "http-status-codes";

import type {
  OpenApiComponents,
  OpenApiOperation,
} from "@/app/api/_lib/openapi";

import {
  BulkApproveConstructionSiteWorkEquipmentSheetsRequestModel,
  BulkDecideConstructionSiteWorkEquipmentSheetsResponseModel,
  BulkRejectConstructionSiteWorkEquipmentSheetsRequestModel,
  ConstructionSiteWorkEquipmentSheetActionsResponseModel,
  ConstructionSiteWorkEquipmentSheetParamsModel,
  ConstructionSiteWorkEquipmentSheetResponseModel,
  ConstructionSiteWorkEquipmentSheetSettingsResponseModel,
  CreateConstructionSiteWorkEquipmentSheetRequestModel,
  DecideConstructionSiteWorkEquipmentSheetRequestModel,
  DeleteConstructionSiteWorkEquipmentSheetRequestModel,
  EQUIPMENT_SHEETS_PATH,
  GetConstructionSiteWorkEquipmentSheetAvailableStockRequestModel,
  GetConstructionSiteWorkEquipmentSheetAvailableStockResponseModel,
  GetConstructionSiteWorkEquipmentSheetFormOptionsRequestModel,
  GetConstructionSiteWorkEquipmentSheetFormOptionsResponseModel,
  GetConstructionSiteWorkEquipmentSheetResponseModel,
  ListConstructionSiteWorkEquipmentSheetsRequestModel,
  ListConstructionSiteWorkEquipmentSheetsResponseModel,
  RejectConstructionSiteWorkEquipmentSheetRequestModel,
  UpdateConstructionSiteWorkEquipmentSheetRequestModel,
} from "./equipment-sheet-models";

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

const ITEM = `${EQUIPMENT_SHEETS_PATH}/{id}`;

/** Request and Response models of `/api/construction/site-work/equipment-sheets` (CM-604). */
export const equipmentSheetOpenApiComponents: OpenApiComponents = {
  CreateConstructionSiteWorkEquipmentSheetRequestModel,
  UpdateConstructionSiteWorkEquipmentSheetRequestModel,
  DeleteConstructionSiteWorkEquipmentSheetRequestModel,
  DecideConstructionSiteWorkEquipmentSheetRequestModel,
  RejectConstructionSiteWorkEquipmentSheetRequestModel,
  BulkApproveConstructionSiteWorkEquipmentSheetsRequestModel,
  BulkRejectConstructionSiteWorkEquipmentSheetsRequestModel,
  ConstructionSiteWorkEquipmentSheetActionsResponseModel,
  ConstructionSiteWorkEquipmentSheetResponseModel,
  GetConstructionSiteWorkEquipmentSheetResponseModel,
  ListConstructionSiteWorkEquipmentSheetsResponseModel,
  BulkDecideConstructionSiteWorkEquipmentSheetsResponseModel,
  ConstructionSiteWorkEquipmentSheetSettingsResponseModel,
  GetConstructionSiteWorkEquipmentSheetFormOptionsResponseModel,
  GetConstructionSiteWorkEquipmentSheetAvailableStockResponseModel,
};

/**
 * Equipment Usage sheet routes (CM-604), menu `site_work.equipment_usage`
 * on the sheet's Project: read, create, update, delete, approve, reject;
 * Financial shows the unit rate, billable quantity and hire cost.
 */
export const equipmentSheetOpenApiOperations: OpenApiOperation[] = [
  {
    method: "get",
    path: EQUIPMENT_SHEETS_PATH,
    summary:
      "A Project's Equipment Usage sheets, newest first, with filters, their options and totals",
    tags: TAGS,
    query: ListConstructionSiteWorkEquipmentSheetsRequestModel,
    successStatus: StatusCodes.OK,
    successDescription: "A page of Equipment Usage sheets",
    successSchema: ListConstructionSiteWorkEquipmentSheetsResponseModel,
    errors: READ_ERRORS,
  },
  {
    method: "post",
    path: EQUIPMENT_SHEETS_PATH,
    summary:
      "Save an Equipment Usage sheet for equipment free that date (posts Consumed stock): Save, or Save & Approve",
    tags: TAGS,
    body: CreateConstructionSiteWorkEquipmentSheetRequestModel,
    successStatus: StatusCodes.CREATED,
    successDescription: "The new Equipment Usage sheet",
    successSchema: GetConstructionSiteWorkEquipmentSheetResponseModel,
    errors: WRITE_ERRORS,
  },
  {
    method: "get",
    path: `${EQUIPMENT_SHEETS_PATH}/form-options`,
    summary:
      "What the usage-sheet form offers on a Project: settings, supervisors, Contractors, Departments, units",
    tags: TAGS,
    query: GetConstructionSiteWorkEquipmentSheetFormOptionsRequestModel,
    successStatus: StatusCodes.OK,
    successDescription: "The form's options",
    successSchema:
      GetConstructionSiteWorkEquipmentSheetFormOptionsResponseModel,
    errors: READ_ERRORS,
  },
  {
    method: "get",
    path: `${EQUIPMENT_SHEETS_PATH}/available-stock`,
    summary: "Stock per material at the Project on the sheet date",
    tags: TAGS,
    query: GetConstructionSiteWorkEquipmentSheetAvailableStockRequestModel,
    successStatus: StatusCodes.OK,
    successDescription: "Stock per material",
    successSchema:
      GetConstructionSiteWorkEquipmentSheetAvailableStockResponseModel,
    errors: READ_ERRORS,
  },
  {
    method: "post",
    path: `${EQUIPMENT_SHEETS_PATH}/bulk-approve`,
    summary:
      "Approve several pending Equipment Usage sheets of a Project (all or none)",
    tags: TAGS,
    body: BulkApproveConstructionSiteWorkEquipmentSheetsRequestModel,
    successStatus: StatusCodes.OK,
    successDescription: "How many were approved",
    successSchema: BulkDecideConstructionSiteWorkEquipmentSheetsResponseModel,
    errors: WRITE_ERRORS,
  },
  {
    method: "post",
    path: `${EQUIPMENT_SHEETS_PATH}/bulk-reject`,
    summary:
      "Reject several pending Equipment Usage sheets of a Project (all or none)",
    tags: TAGS,
    body: BulkRejectConstructionSiteWorkEquipmentSheetsRequestModel,
    successStatus: StatusCodes.OK,
    successDescription: "How many were rejected",
    successSchema: BulkDecideConstructionSiteWorkEquipmentSheetsResponseModel,
    errors: WRITE_ERRORS,
  },
  {
    method: "get",
    path: ITEM,
    summary: "One Equipment Usage sheet, with the previous closing reading",
    tags: TAGS,
    params: ConstructionSiteWorkEquipmentSheetParamsModel,
    successStatus: StatusCodes.OK,
    successDescription: "The Equipment Usage sheet",
    successSchema: GetConstructionSiteWorkEquipmentSheetResponseModel,
    errors: READ_ERRORS,
  },
  {
    method: "post",
    path: `${ITEM}/update`,
    summary:
      "Edit an Equipment Usage sheet (postings replaced; an approved or rejected sheet goes back to pending)",
    tags: TAGS,
    params: ConstructionSiteWorkEquipmentSheetParamsModel,
    body: UpdateConstructionSiteWorkEquipmentSheetRequestModel,
    successStatus: StatusCodes.OK,
    successDescription: "The edited Equipment Usage sheet",
    successSchema: GetConstructionSiteWorkEquipmentSheetResponseModel,
    errors: WRITE_ERRORS,
  },
  {
    method: "post",
    path: `${ITEM}/delete`,
    summary:
      "Delete an Equipment Usage sheet (its stock postings are reversed)",
    tags: TAGS,
    params: ConstructionSiteWorkEquipmentSheetParamsModel,
    body: DeleteConstructionSiteWorkEquipmentSheetRequestModel,
    successStatus: StatusCodes.NO_CONTENT,
    successDescription: "Deleted",
    errors: WRITE_ERRORS,
  },
  {
    method: "post",
    path: `${ITEM}/approve`,
    summary: "Approve a pending Equipment Usage sheet",
    tags: TAGS,
    params: ConstructionSiteWorkEquipmentSheetParamsModel,
    body: DecideConstructionSiteWorkEquipmentSheetRequestModel,
    successStatus: StatusCodes.OK,
    successDescription: "The approved Equipment Usage sheet",
    successSchema: GetConstructionSiteWorkEquipmentSheetResponseModel,
    errors: WRITE_ERRORS,
  },
  {
    method: "post",
    path: `${ITEM}/reject`,
    summary: "Reject a pending Equipment Usage sheet with a reason",
    tags: TAGS,
    params: ConstructionSiteWorkEquipmentSheetParamsModel,
    body: RejectConstructionSiteWorkEquipmentSheetRequestModel,
    successStatus: StatusCodes.OK,
    successDescription: "The rejected Equipment Usage sheet",
    successSchema: GetConstructionSiteWorkEquipmentSheetResponseModel,
    errors: WRITE_ERRORS,
  },
];
