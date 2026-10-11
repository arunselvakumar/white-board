import { StatusCodes } from "http-status-codes";

import type {
  OpenApiComponents,
  OpenApiOperation,
} from "@/app/api/_lib/openapi";

import {
  BulkApproveConstructionSiteWorkWorksheetsRequestModel,
  BulkDecideConstructionSiteWorkWorksheetsResponseModel,
  BulkRejectConstructionSiteWorkWorksheetsRequestModel,
  ConstructionSiteWorkWorksheetActionsResponseModel,
  ConstructionSiteWorkWorksheetLocationModel,
  ConstructionSiteWorkWorksheetLocationResponseModel,
  ConstructionSiteWorkWorksheetMaterialResponseModel,
  ConstructionSiteWorkWorksheetParamsModel,
  ConstructionSiteWorkWorksheetResponseModel,
  ConstructionSiteWorkWorksheetSettingsResponseModel,
  CreateConstructionSiteWorkWorksheetRequestModel,
  DecideConstructionSiteWorkWorksheetRequestModel,
  DeleteConstructionSiteWorkWorksheetRequestModel,
  GetConstructionSiteWorkWorksheetAttendanceRequestModel,
  GetConstructionSiteWorkWorksheetAttendanceResponseModel,
  GetConstructionSiteWorkWorksheetAvailableStockRequestModel,
  GetConstructionSiteWorkWorksheetAvailableStockResponseModel,
  GetConstructionSiteWorkWorksheetFormOptionsRequestModel,
  GetConstructionSiteWorkWorksheetFormOptionsResponseModel,
  ListConstructionSiteWorkWorksheetsRequestModel,
  ListConstructionSiteWorkWorksheetsResponseModel,
  RejectConstructionSiteWorkWorksheetRequestModel,
  UpdateConstructionSiteWorkWorksheetRequestModel,
  WORKSHEETS_PATH,
} from "./worksheet-models";

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

const ITEM = `${WORKSHEETS_PATH}/{id}`;

/** Request and Response models of `/api/construction/site-work/worksheets` (CM-602). */
export const worksheetOpenApiComponents: OpenApiComponents = {
  ConstructionSiteWorkWorksheetLocationModel,
  ConstructionSiteWorkWorksheetLocationResponseModel,
  CreateConstructionSiteWorkWorksheetRequestModel,
  UpdateConstructionSiteWorkWorksheetRequestModel,
  DeleteConstructionSiteWorkWorksheetRequestModel,
  DecideConstructionSiteWorkWorksheetRequestModel,
  RejectConstructionSiteWorkWorksheetRequestModel,
  BulkApproveConstructionSiteWorkWorksheetsRequestModel,
  BulkRejectConstructionSiteWorkWorksheetsRequestModel,
  ConstructionSiteWorkWorksheetActionsResponseModel,
  ConstructionSiteWorkWorksheetMaterialResponseModel,
  ConstructionSiteWorkWorksheetResponseModel,
  ListConstructionSiteWorkWorksheetsResponseModel,
  BulkDecideConstructionSiteWorkWorksheetsResponseModel,
  ConstructionSiteWorkWorksheetSettingsResponseModel,
  GetConstructionSiteWorkWorksheetFormOptionsResponseModel,
  GetConstructionSiteWorkWorksheetAttendanceResponseModel,
  GetConstructionSiteWorkWorksheetAvailableStockResponseModel,
};

/**
 * Daily Worksheet routes (CM-602), menu `site_work.daily_worksheet` on the
 * sheet's Project: read, create, update, delete, approve, reject.
 */
export const worksheetOpenApiOperations: OpenApiOperation[] = [
  {
    method: "get",
    path: WORKSHEETS_PATH,
    summary:
      "A Project's Daily Worksheets, newest first, with filters and their options",
    tags: TAGS,
    query: ListConstructionSiteWorkWorksheetsRequestModel,
    successStatus: StatusCodes.OK,
    successDescription: "A page of Daily Worksheets",
    successSchema: ListConstructionSiteWorkWorksheetsResponseModel,
    errors: READ_ERRORS,
  },
  {
    method: "post",
    path: WORKSHEETS_PATH,
    summary:
      "Save a Daily Worksheet (posts Consumed stock): Save, or Save & Approve with Approve",
    tags: TAGS,
    body: CreateConstructionSiteWorkWorksheetRequestModel,
    successStatus: StatusCodes.CREATED,
    successDescription: "The new Daily Worksheet",
    successSchema: ConstructionSiteWorkWorksheetResponseModel,
    errors: WRITE_ERRORS,
  },
  {
    method: "get",
    path: `${WORKSHEETS_PATH}/form-options`,
    summary:
      "What the worksheet form offers on a Project: settings, Contractors, Departments, Work Types, units",
    tags: TAGS,
    query: GetConstructionSiteWorkWorksheetFormOptionsRequestModel,
    successStatus: StatusCodes.OK,
    successDescription: "The form's options",
    successSchema: GetConstructionSiteWorkWorksheetFormOptionsResponseModel,
    errors: READ_ERRORS,
  },
  {
    method: "get",
    path: `${WORKSHEETS_PATH}/attendance`,
    summary:
      "Attendance on a date against the headcounts already on the Project's worksheets",
    tags: TAGS,
    query: GetConstructionSiteWorkWorksheetAttendanceRequestModel,
    successStatus: StatusCodes.OK,
    successDescription: "Heads by skill: attendance, on worksheets, remaining",
    successSchema: GetConstructionSiteWorkWorksheetAttendanceResponseModel,
    errors: READ_ERRORS,
  },
  {
    method: "get",
    path: `${WORKSHEETS_PATH}/available-stock`,
    summary: "Stock per material at the Project on the sheet date",
    tags: TAGS,
    query: GetConstructionSiteWorkWorksheetAvailableStockRequestModel,
    successStatus: StatusCodes.OK,
    successDescription: "Stock per material",
    successSchema: GetConstructionSiteWorkWorksheetAvailableStockResponseModel,
    errors: READ_ERRORS,
  },
  {
    method: "post",
    path: `${WORKSHEETS_PATH}/bulk-approve`,
    summary:
      "Approve several pending Daily Worksheets of a Project (all or none)",
    tags: TAGS,
    body: BulkApproveConstructionSiteWorkWorksheetsRequestModel,
    successStatus: StatusCodes.OK,
    successDescription: "How many were approved",
    successSchema: BulkDecideConstructionSiteWorkWorksheetsResponseModel,
    errors: WRITE_ERRORS,
  },
  {
    method: "post",
    path: `${WORKSHEETS_PATH}/bulk-reject`,
    summary:
      "Reject several pending Daily Worksheets of a Project (all or none)",
    tags: TAGS,
    body: BulkRejectConstructionSiteWorkWorksheetsRequestModel,
    successStatus: StatusCodes.OK,
    successDescription: "How many were rejected",
    successSchema: BulkDecideConstructionSiteWorkWorksheetsResponseModel,
    errors: WRITE_ERRORS,
  },
  {
    method: "get",
    path: ITEM,
    summary: "One Daily Worksheet",
    tags: TAGS,
    params: ConstructionSiteWorkWorksheetParamsModel,
    successStatus: StatusCodes.OK,
    successDescription: "The Daily Worksheet",
    successSchema: ConstructionSiteWorkWorksheetResponseModel,
    errors: READ_ERRORS,
  },
  {
    method: "post",
    path: `${ITEM}/update`,
    summary:
      "Edit a Daily Worksheet (postings replaced; an approved or rejected sheet goes back to pending)",
    tags: TAGS,
    params: ConstructionSiteWorkWorksheetParamsModel,
    body: UpdateConstructionSiteWorkWorksheetRequestModel,
    successStatus: StatusCodes.OK,
    successDescription: "The edited Daily Worksheet",
    successSchema: ConstructionSiteWorkWorksheetResponseModel,
    errors: WRITE_ERRORS,
  },
  {
    method: "post",
    path: `${ITEM}/delete`,
    summary: "Delete a Daily Worksheet (its stock postings are reversed)",
    tags: TAGS,
    params: ConstructionSiteWorkWorksheetParamsModel,
    body: DeleteConstructionSiteWorkWorksheetRequestModel,
    successStatus: StatusCodes.NO_CONTENT,
    successDescription: "Deleted",
    errors: WRITE_ERRORS,
  },
  {
    method: "post",
    path: `${ITEM}/approve`,
    summary: "Approve a pending Daily Worksheet",
    tags: TAGS,
    params: ConstructionSiteWorkWorksheetParamsModel,
    body: DecideConstructionSiteWorkWorksheetRequestModel,
    successStatus: StatusCodes.OK,
    successDescription: "The approved Daily Worksheet",
    successSchema: ConstructionSiteWorkWorksheetResponseModel,
    errors: WRITE_ERRORS,
  },
  {
    method: "post",
    path: `${ITEM}/reject`,
    summary: "Reject a pending Daily Worksheet with a reason",
    tags: TAGS,
    params: ConstructionSiteWorkWorksheetParamsModel,
    body: RejectConstructionSiteWorkWorksheetRequestModel,
    successStatus: StatusCodes.OK,
    successDescription: "The rejected Daily Worksheet",
    successSchema: ConstructionSiteWorkWorksheetResponseModel,
    errors: WRITE_ERRORS,
  },
];
