import { StatusCodes } from "http-status-codes";

import type {
  OpenApiComponents,
  OpenApiOperation,
} from "@/app/api/_lib/openapi";

import { ConstructionProjectsProjectParamsModel } from "../../project-models";
import {
  ConstructionProjectsProjectActivityEntryResponseModel,
  ListConstructionProjectsProjectActivityRequestModel,
  ListConstructionProjectsProjectActivityResponseModel,
} from "./activity-models";

/** The Project Activity feed's models. */
export const projectActivityOpenApiComponents: OpenApiComponents = {
  ConstructionProjectsProjectActivityEntryResponseModel,
  ListConstructionProjectsProjectActivityResponseModel,
};

export const projectActivityOpenApiOperations: OpenApiOperation[] = [
  {
    method: "get",
    path: "/api/construction/projects/projects/{id}/activity",
    summary:
      "The Project's Activity: Site Engineers and Labours added and removed, Labours transferred in and out (a batch as one entry), each Check In and Check Out (ADR CM-0038, CM-0044); 400 INVALID_CURSOR, 404 PROJECT_NOT_FOUND",
    tags: ["Construction · Projects"],
    params: ConstructionProjectsProjectParamsModel,
    query: ListConstructionProjectsProjectActivityRequestModel,
    successStatus: StatusCodes.OK,
    successDescription: "One page of the feed, 30 entries at most",
    successSchema: ListConstructionProjectsProjectActivityResponseModel,
    errors: [
      StatusCodes.BAD_REQUEST,
      StatusCodes.UNAUTHORIZED,
      StatusCodes.FORBIDDEN,
      StatusCodes.NOT_FOUND,
    ],
  },
];
