import { StatusCodes } from "http-status-codes";

import type {
  OpenApiComponents,
  OpenApiOperation,
} from "@/app/api/_lib/openapi";
import {
  PDF_CONTENT_TYPE,
  XLSX_CONTENT_TYPE,
} from "@/src/reporting/application/report-handlers";

import {
  ConstructionReportingReportJobResponseModel,
  ConstructionReportingReportParamsModel,
  DownloadConstructionReportingReportRequestModel,
  ListConstructionReportingReportsRequestModel,
  ListConstructionReportingReportsResponseModel,
  REPORTS_PATH,
  RequestConstructionReportingReportRequestModel,
} from "./report-models";

const REPORTING = ["Construction · Reporting"];

const ERRORS = [
  StatusCodes.BAD_REQUEST,
  StatusCodes.UNAUTHORIZED,
  StatusCodes.FORBIDDEN,
  StatusCodes.NOT_FOUND,
];

/** Report job models (CM-217, CM-218). */
export const reportingOpenApiComponents: OpenApiComponents = {
  RequestConstructionReportingReportRequestModel,
  ConstructionReportingReportJobResponseModel,
  ListConstructionReportingReportsResponseModel,
};

/** Report job routes (CM-217, CM-218). */
export const reportingOpenApiOperations: OpenApiOperation[] = [
  {
    method: "post",
    path: REPORTS_PATH,
    summary:
      "Request a report: All Labour Attendance, All Labour Payment, Month-wise Labour, Vendor Attendance (projectId null = central) or the muster roll and wage register. The job runs inline until M9's queue, so it usually comes back done with Excel and PDF links. Needs Report on Labour or Vendor for the Project; the payment report and the muster roll also need Financial (403)",
    tags: REPORTING,
    body: RequestConstructionReportingReportRequestModel,
    successStatus: StatusCodes.CREATED,
    successDescription: "The job (done, or failed with a message)",
    successSchema: ConstructionReportingReportJobResponseModel,
    errors: ERRORS,
  },
  {
    method: "get",
    path: REPORTS_PATH,
    summary:
      "The newest 50 reports of a Project you may report on; without projectId, your own central reports",
    tags: REPORTING,
    query: ListConstructionReportingReportsRequestModel,
    successStatus: StatusCodes.OK,
    successDescription: "Report jobs, newest first",
    successSchema: ListConstructionReportingReportsResponseModel,
    errors: ERRORS,
  },
  {
    method: "get",
    path: `${REPORTS_PATH}/{id}`,
    summary: "A report job: status, error and download links",
    tags: REPORTING,
    params: ConstructionReportingReportParamsModel,
    successStatus: StatusCodes.OK,
    successDescription: "The job",
    successSchema: ConstructionReportingReportJobResponseModel,
    errors: ERRORS,
  },
  {
    method: "get",
    path: `${REPORTS_PATH}/{id}/download`,
    summary:
      "Download a done report as Excel or PDF, streamed from private storage after the access check (Financial when it carries amounts; REPORT_NOT_READY 409)",
    tags: REPORTING,
    params: ConstructionReportingReportParamsModel,
    query: DownloadConstructionReportingReportRequestModel,
    successStatus: StatusCodes.OK,
    successDescription: "The file",
    successBinaryContentTypes: [XLSX_CONTENT_TYPE, PDF_CONTENT_TYPE],
    errors: [...ERRORS, StatusCodes.CONFLICT],
  },
];
