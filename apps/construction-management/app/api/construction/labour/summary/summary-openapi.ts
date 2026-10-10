import { StatusCodes } from "http-status-codes";

import type {
  OpenApiComponents,
  OpenApiOperation,
} from "@/app/api/_lib/openapi";

import {
  GetConstructionLabourProjectSummaryRequestModel,
  GetConstructionLabourProjectSummaryResponseModel,
  LABOUR_SUMMARY_PATH,
} from "./summary-models";

export const labourSummaryOpenApiComponents: OpenApiComponents = {
  GetConstructionLabourProjectSummaryRequestModel,
  GetConstructionLabourProjectSummaryResponseModel,
};

export const labourSummaryOpenApiOperations: OpenApiOperation[] = [
  {
    method: "get",
    path: LABOUR_SUMMARY_PATH,
    summary:
      "Labour tiles for a Project's home and Dashboard: present today, vendor headcount, the last 14 days or `from` to `date` (at most 366 days), and payment status (amounts null without Financial)",
    tags: ["Construction · Labour"],
    query: GetConstructionLabourProjectSummaryRequestModel,
    successStatus: StatusCodes.OK,
    successDescription: "The Project's labour summary",
    successSchema: GetConstructionLabourProjectSummaryResponseModel,
    errors: [
      StatusCodes.BAD_REQUEST,
      StatusCodes.UNAUTHORIZED,
      StatusCodes.FORBIDDEN,
    ],
  },
];
