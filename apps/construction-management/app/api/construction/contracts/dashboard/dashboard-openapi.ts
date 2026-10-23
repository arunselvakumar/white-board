import { StatusCodes } from "http-status-codes";

import type {
  OpenApiComponents,
  OpenApiOperation,
} from "@/app/api/_lib/openapi";

import {
  CONTRACTS_DASHBOARD_PATH,
  GetConstructionContractsDashboardRequestModel,
  GetConstructionContractsDashboardResponseModel,
} from "./dashboard-models";

/** The Project Dashboard's Contracts section models (CM-1111). */
export const contractsDashboardOpenApiComponents: OpenApiComponents = {
  GetConstructionContractsDashboardResponseModel,
};

/** The Project Dashboard's Contracts section (CM-1111). */
export const contractsDashboardOpenApiOperations: OpenApiOperation[] = [
  {
    method: "get",
    path: CONTRACTS_DASHBOARD_PATH,
    summary:
      "The Project Dashboard's Contracts section: billed against the BOQ, receivable and payable, retention, open Work Orders and pending bills",
    tags: ["Construction · Contracts"],
    query: GetConstructionContractsDashboardRequestModel,
    successStatus: StatusCodes.OK,
    successDescription: "The Contracts section",
    successSchema: GetConstructionContractsDashboardResponseModel,
    errors: [
      StatusCodes.BAD_REQUEST,
      StatusCodes.UNAUTHORIZED,
      StatusCodes.FORBIDDEN,
      StatusCodes.NOT_FOUND,
    ],
  },
];
