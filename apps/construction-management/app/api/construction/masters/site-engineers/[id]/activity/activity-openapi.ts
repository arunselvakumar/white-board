import { StatusCodes } from "http-status-codes";

import type {
  OpenApiComponents,
  OpenApiOperation,
} from "@/app/api/_lib/openapi";

import { ConstructionMastersIdParamsModel } from "../../../_lib/master-models";
import {
  ListConstructionMastersSiteEngineerActivityRequestModel,
  ListConstructionMastersSiteEngineerActivityResponseModel,
} from "./activity-models";

/** The Site Engineer Activity feed's models. */
export const siteEngineerActivityOpenApiComponents: OpenApiComponents = {
  ListConstructionMastersSiteEngineerActivityResponseModel,
};

export const siteEngineerActivityOpenApiOperations: OpenApiOperation[] = [
  {
    method: "get",
    path: "/api/construction/masters/site-engineers/{id}/activity",
    summary:
      "The Site Engineer's Activity: Projects added to and removed from, check-in entries (ADR CM-0044 §7; menu `masters.labours`, read); 400 INVALID_CURSOR, 404 SUPERVISOR_NOT_FOUND",
    tags: ["Construction · Masters"],
    params: ConstructionMastersIdParamsModel,
    query: ListConstructionMastersSiteEngineerActivityRequestModel,
    successStatus: StatusCodes.OK,
    successDescription: "One page of the feed, 30 entries at most",
    successSchema: ListConstructionMastersSiteEngineerActivityResponseModel,
    errors: [
      StatusCodes.BAD_REQUEST,
      StatusCodes.UNAUTHORIZED,
      StatusCodes.FORBIDDEN,
      StatusCodes.NOT_FOUND,
    ],
  },
];
