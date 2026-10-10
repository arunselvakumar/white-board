import { StatusCodes } from "http-status-codes";

import type {
  OpenApiComponents,
  OpenApiOperation,
} from "@/app/api/_lib/openapi";

import {
  GetConstructionProcurementDashboardRequestModel,
  GetConstructionProcurementDashboardResponseModel,
} from "./dashboard-models";

export const procurementDashboardOpenApiComponents: OpenApiComponents = {
  GetConstructionProcurementDashboardResponseModel,
};

export const procurementDashboardOpenApiOperations: OpenApiOperation[] = [
  {
    method: "get",
    path: "/api/construction/procurement/dashboard",
    summary:
      "The Project Dashboard's Materials section and Material Approvals KPI (CM-510)",
    tags: ["Construction · Procurement"],
    query: GetConstructionProcurementDashboardRequestModel,
    successStatus: StatusCodes.OK,
    successDescription: "Materials figures for the Project and duration",
    successSchema: GetConstructionProcurementDashboardResponseModel,
    errors: [
      StatusCodes.BAD_REQUEST,
      StatusCodes.UNAUTHORIZED,
      StatusCodes.FORBIDDEN,
    ],
  },
];
