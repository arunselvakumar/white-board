import { StatusCodes } from "http-status-codes";

import type {
  OpenApiComponents,
  OpenApiOperation,
} from "@/app/api/_lib/openapi";

import {
  MARKETING_READ_ERRORS,
  MARKETING_TAGS,
} from "../companies/companies-openapi";
import {
  DASHBOARD_PATH,
  GetConstructionMarketingDashboardRequestModel,
  GetConstructionMarketingDashboardResponseModel,
} from "./dashboard-models";

/** Dashboard models. */
export const marketingDashboardOpenApiComponents: OpenApiComponents = {
  GetConstructionMarketingDashboardResponseModel,
};

/** The Marketing Dashboard (menu `marketing.dashboard`). */
export const marketingDashboardOpenApiOperations: OpenApiOperation[] = [
  {
    method: "get",
    path: DASHBOARD_PATH,
    summary:
      "The Marketing Dashboard for a period: own, team or one Marketing Person's figures",
    tags: MARKETING_TAGS,
    query: GetConstructionMarketingDashboardRequestModel,
    successStatus: StatusCodes.OK,
    successDescription: "The Dashboard's figures",
    successSchema: GetConstructionMarketingDashboardResponseModel,
    errors: MARKETING_READ_ERRORS,
  },
];
