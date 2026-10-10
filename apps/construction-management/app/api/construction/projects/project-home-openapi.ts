import { StatusCodes } from "http-status-codes";

import type {
  OpenApiComponents,
  OpenApiOperation,
} from "@/app/api/_lib/openapi";

import {
  ConstructionProjectsProjectDevelopmentsResponseModel,
  UpdateConstructionProjectsProjectDevelopmentsRequestModel,
} from "./projects/[id]/developments/developments-models";
import { ConstructionProjectsProjectParamsModel } from "./projects/project-models";

const PROJECTS = ["Construction · Projects"];

const BASE = "/api/construction/projects/projects";

const SESSION_ERRORS = [
  StatusCodes.UNAUTHORIZED,
  StatusCodes.FORBIDDEN,
] as const;

/**
 * Models of a Project's Amenities and Common Developments (CM-404), its
 * home and preferences (CM-411) and its dashboard (CM-412).
 */
export const projectHomeOpenApiComponents: OpenApiComponents = {
  ConstructionProjectsProjectDevelopmentsResponseModel,
  UpdateConstructionProjectsProjectDevelopmentsRequestModel,
};

/** Routes of CM-404 (Project side), CM-411 and CM-412. */
export const projectHomeOpenApiOperations: OpenApiOperation[] = [
  {
    method: "get",
    path: `${BASE}/{id}/developments`,
    summary:
      "A Project's Amenities and Common Developments, disabled ones included, and the Company's enabled ones to add (menu `projects.project`, read; 404 for a Project you are not on)",
    tags: PROJECTS,
    params: ConstructionProjectsProjectParamsModel,
    successStatus: StatusCodes.OK,
    successDescription: "Assigned rows and choices per kind",
    successSchema: ConstructionProjectsProjectDevelopmentsResponseModel,
    errors: [StatusCodes.BAD_REQUEST, ...SESSION_ERRORS, StatusCodes.NOT_FOUND],
  },
  {
    method: "post",
    path: `${BASE}/{id}/developments/update`,
    summary:
      "Set a Project's Amenities and Common Developments: the full set per kind, a kind left out keeps its rows (menu `projects.project`, update; 400 AMENITY_NOT_FOUND, AMENITY_DISABLED and the Common Development equivalents)",
    tags: PROJECTS,
    params: ConstructionProjectsProjectParamsModel,
    body: UpdateConstructionProjectsProjectDevelopmentsRequestModel,
    successStatus: StatusCodes.OK,
    successDescription: "Assigned rows and choices per kind",
    successSchema: ConstructionProjectsProjectDevelopmentsResponseModel,
    errors: [
      StatusCodes.BAD_REQUEST,
      ...SESSION_ERRORS,
      StatusCodes.PAYMENT_REQUIRED,
      StatusCodes.NOT_FOUND,
    ],
  },
];
