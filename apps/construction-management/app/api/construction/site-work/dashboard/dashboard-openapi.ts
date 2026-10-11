import { StatusCodes } from "http-status-codes";

import type {
  OpenApiComponents,
  OpenApiOperation,
} from "@/app/api/_lib/openapi";

import {
  GetConstructionSiteWorkDailyWorkDashboardResponseModel,
  GetConstructionSiteWorkDashboardRequestModel,
  GetConstructionSiteWorkEquipmentUsageDashboardResponseModel,
  SITE_WORK_DASHBOARD_PATH,
} from "./dashboard-models";

const TAGS = ["Construction · Site work"];

const ERRORS = [
  StatusCodes.BAD_REQUEST,
  StatusCodes.UNAUTHORIZED,
  StatusCodes.FORBIDDEN,
];

/** Response models of the Project Dashboard's site-work sections (CM-608). */
export const siteWorkDashboardOpenApiComponents: OpenApiComponents = {
  GetConstructionSiteWorkDailyWorkDashboardResponseModel,
  GetConstructionSiteWorkEquipmentUsageDashboardResponseModel,
};

export const siteWorkDashboardOpenApiOperations: OpenApiOperation[] = [
  {
    method: "get",
    path: `${SITE_WORK_DASHBOARD_PATH}/daily-work`,
    summary:
      "The Project Dashboard's Daily Work section: worksheet labour per day against attendance heads, contractor-wise labour, worksheets, labour-days and pending approvals (CM-608). Needs Dashboard Read on the Project",
    tags: TAGS,
    query: GetConstructionSiteWorkDashboardRequestModel,
    successStatus: StatusCodes.OK,
    successDescription: "Daily Work figures for the Project and duration",
    successSchema: GetConstructionSiteWorkDailyWorkDashboardResponseModel,
    errors: ERRORS,
  },
  {
    method: "get",
    path: `${SITE_WORK_DASHBOARD_PATH}/equipment-usage`,
    summary:
      "The Project Dashboard's Equipment Usage section: top equipment by work hours, owned vs rented hours, sheets, km, trips, fuel overruns and (with Financial on Equipment Usage) rented hire cost (CM-608). Needs Dashboard Read on the Project",
    tags: TAGS,
    query: GetConstructionSiteWorkDashboardRequestModel,
    successStatus: StatusCodes.OK,
    successDescription: "Equipment Usage figures for the Project and duration",
    successSchema: GetConstructionSiteWorkEquipmentUsageDashboardResponseModel,
    errors: ERRORS,
  },
];
