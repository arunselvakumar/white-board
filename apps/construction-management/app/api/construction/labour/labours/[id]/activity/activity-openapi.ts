import { StatusCodes } from "http-status-codes";

import type {
  OpenApiComponents,
  OpenApiOperation,
} from "@/app/api/_lib/openapi";

import { LABOURS_PATH, LabourIdParamsModel } from "../../labour-models";
import {
  ConstructionLabourLabourActivityEntryResponseModel,
  ListConstructionLabourLabourActivityRequestModel,
  ListConstructionLabourLabourActivityResponseModel,
} from "./activity-models";

/** The Labour Activity feed's models. */
export const labourActivityOpenApiComponents: OpenApiComponents = {
  ConstructionLabourLabourActivityEntryResponseModel,
  ListConstructionLabourLabourActivityResponseModel,
};

export const labourActivityOpenApiOperations: OpenApiOperation[] = [
  {
    method: "get",
    path: `${LABOURS_PATH}/{id}/activity`,
    summary:
      "The Labour's Activity: Project moves, attendance and its changes, profile entries (ADR CM-0038); 400 INVALID_CURSOR",
    tags: ["Construction · Labour"],
    params: LabourIdParamsModel,
    query: ListConstructionLabourLabourActivityRequestModel,
    successStatus: StatusCodes.OK,
    successDescription: "One page of the feed, 30 entries at most",
    successSchema: ListConstructionLabourLabourActivityResponseModel,
    errors: [
      StatusCodes.BAD_REQUEST,
      StatusCodes.UNAUTHORIZED,
      StatusCodes.FORBIDDEN,
      StatusCodes.NOT_FOUND,
    ],
  },
];
