import { StatusCodes } from "http-status-codes";

import type {
  OpenApiComponents,
  OpenApiOperation,
} from "@/app/api/_lib/openapi";

import {
  ListConstructionReportingFilterOptionsRequestModel,
  ListConstructionReportingFilterOptionsResponseModel,
  REPORT_FILTER_OPTIONS_PATH,
} from "./filter-options-models";

/** The report cards' picker choices (CM-903). */
export const reportingFilterOptionsOpenApiComponents: OpenApiComponents = {
  ListConstructionReportingFilterOptionsResponseModel,
};

export const reportingFilterOptionsOpenApiOperations: OpenApiOperation[] = [
  {
    method: "get",
    path: REPORT_FILTER_OPTIONS_PATH,
    summary:
      "The choices for the report cards' pickers on a Project (scope=project&projectId=) or centrally (scope=central): Projects, Stores, vendors, Labour Categories, Suppliers, Material Categories, Materials and who raised Purchase Requests, each only when a report you may request takes it",
    tags: ["Construction · Reporting"],
    query: ListConstructionReportingFilterOptionsRequestModel,
    successStatus: StatusCodes.OK,
    successDescription: "Choices per picker, by name",
    successSchema: ListConstructionReportingFilterOptionsResponseModel,
    errors: [
      StatusCodes.BAD_REQUEST,
      StatusCodes.UNAUTHORIZED,
      StatusCodes.NOT_FOUND,
    ],
  },
];
