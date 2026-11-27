import { StatusCodes } from "http-status-codes";

import type {
  OpenApiComponents,
  OpenApiOperation,
} from "@/app/api/_lib/openapi";

import { EMPLOYEES_PATH, EmployeeIdParamsModel } from "../../employee-models";
import {
  ConstructionLabourEmployeeActivityEntryResponseModel,
  ListConstructionLabourEmployeeActivityRequestModel,
  ListConstructionLabourEmployeeActivityResponseModel,
} from "./activity-models";

/** The Employee Activity feed's models. */
export const employeeActivityOpenApiComponents: OpenApiComponents = {
  ConstructionLabourEmployeeActivityEntryResponseModel,
  ListConstructionLabourEmployeeActivityResponseModel,
};

export const employeeActivityOpenApiOperations: OpenApiOperation[] = [
  {
    method: "get",
    path: `${EMPLOYEES_PATH}/{id}/activity`,
    summary:
      "The Employee's Activity: Project moves, attendance and its changes, check-in entries, profile entries (ADR CM-0038, CM-0044, CM-0055); 400 INVALID_CURSOR",
    tags: ["Construction · Labour"],
    params: EmployeeIdParamsModel,
    query: ListConstructionLabourEmployeeActivityRequestModel,
    successStatus: StatusCodes.OK,
    successDescription: "One page of the feed, 30 entries at most",
    successSchema: ListConstructionLabourEmployeeActivityResponseModel,
    errors: [
      StatusCodes.BAD_REQUEST,
      StatusCodes.UNAUTHORIZED,
      StatusCodes.FORBIDDEN,
      StatusCodes.NOT_FOUND,
    ],
  },
];
