import { StatusCodes } from "http-status-codes";

import type {
  OpenApiComponents,
  OpenApiOperation,
} from "@/app/api/_lib/openapi";
import { PDF_CONTENT_TYPE } from "@/src/reporting/application/report-handlers";

import {
  ConstructionSiteWorkProgressReportActionsResponseModel,
  ConstructionSiteWorkProgressReportParamsModel,
  ConstructionSiteWorkProgressReportResponseModel,
  CreateConstructionSiteWorkProgressReportRequestModel,
  GetConstructionSiteWorkProgressReportFormOptionsRequestModel,
  GetConstructionSiteWorkProgressReportFormOptionsResponseModel,
  ListConstructionSiteWorkProgressReportsRequestModel,
  ListConstructionSiteWorkProgressReportsResponseModel,
  PROGRESS_REPORTS_PATH,
} from "./progress-report-models";

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

const ITEM = `${PROGRESS_REPORTS_PATH}/{id}`;

/** Request and Response models of `/api/construction/site-work/progress-reports` (CM-606). */
export const progressReportOpenApiComponents: OpenApiComponents = {
  CreateConstructionSiteWorkProgressReportRequestModel,
  ConstructionSiteWorkProgressReportActionsResponseModel,
  ConstructionSiteWorkProgressReportResponseModel,
  ListConstructionSiteWorkProgressReportsResponseModel,
  GetConstructionSiteWorkProgressReportFormOptionsResponseModel,
};

/**
 * Progress Reports routes (CM-606), menu `site_work.progress_reports` on
 * the report's Project: create (generate, retry), read (list, download),
 * delete.
 */
export const progressReportOpenApiOperations: OpenApiOperation[] = [
  {
    method: "get",
    path: PROGRESS_REPORTS_PATH,
    summary: "A Project's Daily Progress Reports, newest first (the latest 50)",
    tags: TAGS,
    query: ListConstructionSiteWorkProgressReportsRequestModel,
    successStatus: StatusCodes.OK,
    successDescription: "Daily Progress Reports",
    successSchema: ListConstructionSiteWorkProgressReportsResponseModel,
    errors: READ_ERRORS,
  },
  {
    method: "post",
    path: PROGRESS_REPORTS_PATH,
    summary:
      "Generate a Daily Progress Report for a date (not after today): takes the date's DPR number the first time and reuses it after, then runs the job inline with a 60-second limit. Hire cost prints only with Financial on Equipment Usage",
    tags: TAGS,
    body: CreateConstructionSiteWorkProgressReportRequestModel,
    successStatus: StatusCodes.CREATED,
    successDescription: "The report (done, or failed with a message)",
    successSchema: ConstructionSiteWorkProgressReportResponseModel,
    errors: WRITE_ERRORS,
  },
  {
    method: "get",
    path: `${PROGRESS_REPORTS_PATH}/form-options`,
    summary:
      "What Create new offers: today, the Project's Team Members for Report Filled By, and the report types",
    tags: TAGS,
    query: GetConstructionSiteWorkProgressReportFormOptionsRequestModel,
    successStatus: StatusCodes.OK,
    successDescription: "Form options",
    successSchema:
      GetConstructionSiteWorkProgressReportFormOptionsResponseModel,
    errors: READ_ERRORS,
  },
  {
    method: "get",
    path: ITEM,
    summary: "One Daily Progress Report: status, error and download link",
    tags: TAGS,
    params: ConstructionSiteWorkProgressReportParamsModel,
    successStatus: StatusCodes.OK,
    successDescription: "The report",
    successSchema: ConstructionSiteWorkProgressReportResponseModel,
    errors: READ_ERRORS,
  },
  {
    method: "post",
    path: `${ITEM}/retry`,
    summary:
      "Run a failed Daily Progress Report again (REPORT_NOT_FAILED 409 otherwise); needs create",
    tags: TAGS,
    params: ConstructionSiteWorkProgressReportParamsModel,
    successStatus: StatusCodes.OK,
    successDescription: "The report after the run",
    successSchema: ConstructionSiteWorkProgressReportResponseModel,
    errors: WRITE_ERRORS,
  },
  {
    method: "post",
    path: `${ITEM}/delete`,
    summary:
      "Delete a Daily Progress Report and its PDF; the date keeps its number",
    tags: TAGS,
    params: ConstructionSiteWorkProgressReportParamsModel,
    successStatus: StatusCodes.NO_CONTENT,
    successDescription: "Deleted",
    errors: WRITE_ERRORS,
  },
  {
    method: "get",
    path: `${ITEM}/download`,
    summary:
      "Download a done Daily Progress Report's PDF (it has no Excel). Needs read, and Financial on Equipment Usage when it shows hire cost; REPORT_NOT_READY 409",
    tags: TAGS,
    params: ConstructionSiteWorkProgressReportParamsModel,
    successStatus: StatusCodes.OK,
    successDescription: "The PDF",
    successBinaryContentTypes: [PDF_CONTENT_TYPE],
    errors: [...READ_ERRORS, StatusCodes.CONFLICT],
  },
];
