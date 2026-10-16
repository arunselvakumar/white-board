import { StatusCodes } from "http-status-codes";

import type {
  OpenApiComponents,
  OpenApiOperation,
} from "@/app/api/_lib/openapi";

import {
  COMPANY_DASHBOARD_PATH,
  GetConstructionReportingCompanyDashboardRequestModel,
  GetConstructionReportingCompanyDashboardResponseModel,
} from "./company-dashboard-models";

export const companyDashboardOpenApiComponents: OpenApiComponents = {
  GetConstructionReportingCompanyDashboardResponseModel,
};

export const companyDashboardOpenApiOperations: OpenApiOperation[] = [
  {
    method: "get",
    path: COMPANY_DASHBOARD_PATH,
    summary:
      "The Company Dashboard: totals and one row per visible Project (CM-902)",
    tags: ["Construction · Reporting"],
    query: GetConstructionReportingCompanyDashboardRequestModel,
    successStatus: StatusCodes.OK,
    successDescription: "Figures across the caller's Projects",
    successSchema: GetConstructionReportingCompanyDashboardResponseModel,
    errors: [
      StatusCodes.BAD_REQUEST,
      StatusCodes.UNAUTHORIZED,
      StatusCodes.FORBIDDEN,
    ],
  },
];
