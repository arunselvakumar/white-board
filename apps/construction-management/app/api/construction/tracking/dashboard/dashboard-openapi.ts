import { StatusCodes } from "http-status-codes";

import type {
  OpenApiComponents,
  OpenApiOperation,
} from "@/app/api/_lib/openapi";

import {
  GetConstructionTrackingDashboardRequestModel,
  GetConstructionTrackingDashboardResponseModel,
  TRACKING_DASHBOARD_PATH,
} from "./dashboard-models";

export const trackingDashboardOpenApiComponents: OpenApiComponents = {
  GetConstructionTrackingDashboardResponseModel,
};

export const trackingDashboardOpenApiOperations: OpenApiOperation[] = [
  {
    method: "get",
    path: TRACKING_DASHBOARD_PATH,
    summary:
      "The Project Dashboard's Task, Issue & Snag and Inspection Request sections and KPI tiles (CM-805)",
    tags: ["Construction · Tracking"],
    query: GetConstructionTrackingDashboardRequestModel,
    successStatus: StatusCodes.OK,
    successDescription: "Tracking figures for the Project and duration",
    successSchema: GetConstructionTrackingDashboardResponseModel,
    errors: [
      StatusCodes.BAD_REQUEST,
      StatusCodes.UNAUTHORIZED,
      StatusCodes.FORBIDDEN,
    ],
  },
];
