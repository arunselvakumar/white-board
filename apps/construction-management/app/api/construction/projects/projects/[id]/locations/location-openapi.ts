import { StatusCodes } from "http-status-codes";

import type {
  OpenApiComponents,
  OpenApiOperation,
} from "@/app/api/_lib/openapi";

import { ConstructionProjectsProjectParamsModel } from "../../project-models";
import {
  ConstructionProjectsLocationParamsModel,
  ConstructionProjectsLocationResponseModel,
  CreateConstructionProjectsLocationRequestModel,
  ListConstructionProjectsLocationsResponseModel,
  MoveConstructionProjectsLocationRequestModel,
  UpdateConstructionProjectsLocationRequestModel,
} from "./location-models";

const PROJECTS = ["Construction · Projects"];

const ITEM = "/api/construction/projects/projects/{id}/locations";

const ERRORS = [
  StatusCodes.BAD_REQUEST,
  StatusCodes.UNAUTHORIZED,
  StatusCodes.FORBIDDEN,
  StatusCodes.NOT_FOUND,
] as const;

/** Locations' models (CM-405). */
export const locationOpenApiComponents: OpenApiComponents = {
  ConstructionProjectsLocationResponseModel,
  ListConstructionProjectsLocationsResponseModel,
  CreateConstructionProjectsLocationRequestModel,
  UpdateConstructionProjectsLocationRequestModel,
  MoveConstructionProjectsLocationRequestModel,
};

/** Locations' routes (CM-405), under the `projects.locations` menu. */
export const locationOpenApiOperations: OpenApiOperation[] = [
  {
    method: "get",
    path: ITEM,
    summary: "The Project's Locations in order",
    tags: PROJECTS,
    params: ConstructionProjectsProjectParamsModel,
    successStatus: StatusCodes.OK,
    successDescription: "Locations",
    successSchema: ListConstructionProjectsLocationsResponseModel,
    errors: [...ERRORS],
  },
  {
    method: "post",
    path: ITEM,
    summary: "Add a Location at the end of the list (409 LOCATION_NAME_IN_USE)",
    tags: PROJECTS,
    params: ConstructionProjectsProjectParamsModel,
    body: CreateConstructionProjectsLocationRequestModel,
    successStatus: StatusCodes.CREATED,
    successDescription: "The new Location",
    successSchema: ConstructionProjectsLocationResponseModel,
    errors: [...ERRORS, StatusCodes.CONFLICT, StatusCodes.PAYMENT_REQUIRED],
  },
  {
    method: "post",
    path: `${ITEM}/{locationId}/update`,
    summary:
      "Edit a Location's name and description (409 LOCATION_CHANGED when expectedUpdatedAt is stale, LOCATION_NAME_IN_USE)",
    tags: PROJECTS,
    params: ConstructionProjectsLocationParamsModel,
    body: UpdateConstructionProjectsLocationRequestModel,
    successStatus: StatusCodes.OK,
    successDescription: "The Location",
    successSchema: ConstructionProjectsLocationResponseModel,
    errors: [...ERRORS, StatusCodes.CONFLICT, StatusCodes.PAYMENT_REQUIRED],
  },
  {
    method: "post",
    path: `${ITEM}/{locationId}/move`,
    summary:
      "Move a Location up or down one place; answers the list in its new order",
    tags: PROJECTS,
    params: ConstructionProjectsLocationParamsModel,
    body: MoveConstructionProjectsLocationRequestModel,
    successStatus: StatusCodes.OK,
    successDescription: "Locations in order",
    successSchema: ListConstructionProjectsLocationsResponseModel,
    errors: [...ERRORS, StatusCodes.CONFLICT, StatusCodes.PAYMENT_REQUIRED],
  },
  {
    method: "post",
    path: `${ITEM}/{locationId}/delete`,
    summary:
      "Delete a Location (409 LOCATION_IN_USE while site records point at it)",
    tags: PROJECTS,
    params: ConstructionProjectsLocationParamsModel,
    successStatus: StatusCodes.NO_CONTENT,
    successDescription: "Deleted",
    errors: [...ERRORS, StatusCodes.CONFLICT, StatusCodes.PAYMENT_REQUIRED],
  },
];
