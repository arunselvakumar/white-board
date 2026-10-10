import { StatusCodes } from "http-status-codes";

import type {
  OpenApiComponents,
  OpenApiOperation,
} from "@/app/api/_lib/openapi";

import {
  DASHBOARD_PATH,
  GetConstructionHrmsDashboardResponseModel,
} from "./dashboard-models";

const HRMS = ["Construction · HRMS"];

/** The HRMS Dashboard model (CM-319). */
export const dashboardOpenApiComponents: OpenApiComponents = {
  GetConstructionHrmsDashboardResponseModel,
};

/** The HRMS Dashboard route (CM-319). */
export const dashboardOpenApiOperations: OpenApiOperation[] = [
  {
    method: "get",
    path: DASHBOARD_PATH,
    summary:
      "The HRMS Dashboard: today's snapshot, present/absent breakdown and 14-day trend (attendance View All), pending approvals the caller may decide (approve or reject), leave in the next 14 days (leave View All), upcoming holidays (holidays read) and the caller's own day, balances and requests (menu `hrms.hrms`, read)",
    tags: HRMS,
    successStatus: StatusCodes.OK,
    successDescription: "The dashboard, with the sections the caller may see",
    successSchema: GetConstructionHrmsDashboardResponseModel,
    errors: [StatusCodes.UNAUTHORIZED, StatusCodes.FORBIDDEN],
  },
];
