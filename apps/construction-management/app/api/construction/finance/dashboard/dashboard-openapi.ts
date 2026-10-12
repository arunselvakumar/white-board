import { StatusCodes } from "http-status-codes";

import type {
  OpenApiComponents,
  OpenApiOperation,
} from "@/app/api/_lib/openapi";

import {
  FINANCE_DASHBOARD_PATH,
  GetConstructionFinanceDashboardRequestModel,
  GetConstructionFinanceDashboardResponseModel,
} from "./dashboard-models";

export const financeDashboardOpenApiComponents: OpenApiComponents = {
  GetConstructionFinanceDashboardResponseModel,
};

export const financeDashboardOpenApiOperations: OpenApiOperation[] = [
  {
    method: "get",
    path: FINANCE_DASHBOARD_PATH,
    summary:
      "The Project Dashboard's Payments section and Payment Approvals KPI (CM-709)",
    tags: ["Construction · Finance"],
    query: GetConstructionFinanceDashboardRequestModel,
    successStatus: StatusCodes.OK,
    successDescription: "Payment figures for the Project and duration",
    successSchema: GetConstructionFinanceDashboardResponseModel,
    errors: [
      StatusCodes.BAD_REQUEST,
      StatusCodes.UNAUTHORIZED,
      StatusCodes.FORBIDDEN,
    ],
  },
];
