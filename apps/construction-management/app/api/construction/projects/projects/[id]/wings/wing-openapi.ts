import { StatusCodes } from "http-status-codes";

import type {
  OpenApiComponents,
  OpenApiOperation,
} from "@/app/api/_lib/openapi";

import { ConstructionProjectsProjectParamsModel } from "../../project-models";
import {
  ConstructionProjectsPhaseParamsModel,
  ConstructionProjectsPhaseResponseModel,
  ConstructionProjectsWingParamsModel,
  ConstructionProjectsWingResponseModel,
  CreateConstructionProjectsPhaseRequestModel,
  CreateConstructionProjectsWingRequestModel,
  ListConstructionProjectsPhasesResponseModel,
  ListConstructionProjectsWingsResponseModel,
  RenameConstructionProjectsPhaseRequestModel,
  UpdateConstructionProjectsWingRequestModel,
} from "./wing-models";

const PROJECTS = ["Construction · Projects"];

const PROJECT = "/api/construction/projects/projects/{id}";

const ERRORS = [
  StatusCodes.BAD_REQUEST,
  StatusCodes.UNAUTHORIZED,
  StatusCodes.FORBIDDEN,
  StatusCodes.NOT_FOUND,
] as const;

/** Phases' and Wings' models (CM-402). */
export const wingOpenApiComponents: OpenApiComponents = {
  ConstructionProjectsPhaseResponseModel,
  ListConstructionProjectsPhasesResponseModel,
  CreateConstructionProjectsPhaseRequestModel,
  RenameConstructionProjectsPhaseRequestModel,
  ListConstructionProjectsWingsResponseModel,
  ConstructionProjectsWingResponseModel,
  CreateConstructionProjectsWingRequestModel,
  UpdateConstructionProjectsWingRequestModel,
};

/** Phases' and Wings' routes (CM-402), under the `projects.wings` menu. */
export const wingOpenApiOperations: OpenApiOperation[] = [
  {
    method: "get",
    path: `${PROJECT}/phases`,
    summary: "The Project's Phases in order, with their Wing counts",
    tags: PROJECTS,
    params: ConstructionProjectsProjectParamsModel,
    successStatus: StatusCodes.OK,
    successDescription: "Phases",
    successSchema: ListConstructionProjectsPhasesResponseModel,
    errors: [...ERRORS],
  },
  {
    method: "post",
    path: `${PROJECT}/phases`,
    summary: "Add a Phase after the last one (409 PHASE_NAME_IN_USE)",
    tags: PROJECTS,
    params: ConstructionProjectsProjectParamsModel,
    body: CreateConstructionProjectsPhaseRequestModel,
    successStatus: StatusCodes.CREATED,
    successDescription: "The new Phase",
    successSchema: ConstructionProjectsPhaseResponseModel,
    errors: [...ERRORS, StatusCodes.CONFLICT, StatusCodes.PAYMENT_REQUIRED],
  },
  {
    method: "post",
    path: `${PROJECT}/phases/{phaseId}/rename`,
    summary:
      "Rename a Phase (409 PHASE_CHANGED when expectedUpdatedAt is stale, PHASE_NAME_IN_USE)",
    tags: PROJECTS,
    params: ConstructionProjectsPhaseParamsModel,
    body: RenameConstructionProjectsPhaseRequestModel,
    successStatus: StatusCodes.OK,
    successDescription: "The renamed Phase",
    successSchema: ConstructionProjectsPhaseResponseModel,
    errors: [...ERRORS, StatusCodes.CONFLICT, StatusCodes.PAYMENT_REQUIRED],
  },
  {
    method: "post",
    path: `${PROJECT}/phases/{phaseId}/delete`,
    summary: "Delete an empty Phase (409 PHASE_NOT_EMPTY while it holds Wings)",
    tags: PROJECTS,
    params: ConstructionProjectsPhaseParamsModel,
    successStatus: StatusCodes.NO_CONTENT,
    successDescription: "Deleted",
    errors: [...ERRORS, StatusCodes.CONFLICT, StatusCodes.PAYMENT_REQUIRED],
  },
  {
    method: "get",
    path: `${PROJECT}/wings`,
    summary:
      "The Wings screen: every Phase in order with its Wings, floor and unit totals per Wing, Phase and Project",
    tags: PROJECTS,
    params: ConstructionProjectsProjectParamsModel,
    successStatus: StatusCodes.OK,
    successDescription: "Phases with their Wings",
    successSchema: ListConstructionProjectsWingsResponseModel,
    errors: [...ERRORS],
  },
  {
    method: "post",
    path: `${PROJECT}/wings`,
    summary:
      "Add a Wing: Wing Type, name, configuration and the floors and units from the editor in one request (409 WING_NAME_IN_USE)",
    tags: PROJECTS,
    params: ConstructionProjectsProjectParamsModel,
    body: CreateConstructionProjectsWingRequestModel,
    successStatus: StatusCodes.CREATED,
    successDescription: "The new Wing with its floors and units",
    successSchema: ConstructionProjectsWingResponseModel,
    errors: [...ERRORS, StatusCodes.CONFLICT, StatusCodes.PAYMENT_REQUIRED],
  },
  {
    method: "get",
    path: `${PROJECT}/wings/{wingId}`,
    summary:
      "One Wing with its configuration, floors (top to bottom) and units",
    tags: PROJECTS,
    params: ConstructionProjectsWingParamsModel,
    successStatus: StatusCodes.OK,
    successDescription: "The Wing",
    successSchema: ConstructionProjectsWingResponseModel,
    errors: [...ERRORS],
  },
  {
    method: "post",
    path: `${PROJECT}/wings/{wingId}/update`,
    summary:
      "Edit a Wing: name, Phase and every floor it keeps; ids are kept, rows left out removed (409 WING_CHANGED, WING_NAME_IN_USE, UNIT_IN_USE, FLOOR_IN_USE)",
    tags: PROJECTS,
    params: ConstructionProjectsWingParamsModel,
    body: UpdateConstructionProjectsWingRequestModel,
    successStatus: StatusCodes.OK,
    successDescription: "The saved Wing",
    successSchema: ConstructionProjectsWingResponseModel,
    errors: [...ERRORS, StatusCodes.CONFLICT, StatusCodes.PAYMENT_REQUIRED],
  },
  {
    method: "post",
    path: `${PROJECT}/wings/{wingId}/delete`,
    summary:
      "Delete a Wing with its floors and units (409 WING_IN_USE while site records point at it)",
    tags: PROJECTS,
    params: ConstructionProjectsWingParamsModel,
    successStatus: StatusCodes.NO_CONTENT,
    successDescription: "Deleted",
    errors: [...ERRORS, StatusCodes.CONFLICT, StatusCodes.PAYMENT_REQUIRED],
  },
];
