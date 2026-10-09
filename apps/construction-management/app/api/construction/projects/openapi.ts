import { StatusCodes } from "http-status-codes";

import type {
  OpenApiComponents,
  OpenApiOperation,
} from "@/app/api/_lib/openapi";

import { UpdateConstructionProjectsProjectRequestModel } from "./projects/[id]/update/update-project-request-model";
import { CreateConstructionProjectsProjectRequestModel } from "./projects/create-project-request-model";
import { ListConstructionProjectsCustomFieldLabelsResponseModel } from "./projects/custom-field-labels/custom-field-labels-models";
import {
  ListConstructionProjectsProjectsQueryModel,
  ListConstructionProjectsProjectsResponseModel,
} from "./projects/list-projects-models";
import { ListConstructionProjectsProjectOptionsResponseModel } from "./projects/options/list-project-options-response-model";
import {
  ConstructionProjectsProjectParamsModel,
  ConstructionProjectsProjectResponseModel,
} from "./projects/project-models";

const PROJECTS = ["Construction · Projects"];

const BASE = "/api/construction/projects/projects";

const SESSION_ERRORS = [
  StatusCodes.UNAUTHORIZED,
  StatusCodes.FORBIDDEN,
] as const;

/** The projects context's Request and Response models (ADR CM-0001). */
export const projectsOpenApiComponents: OpenApiComponents = {
  ListConstructionProjectsProjectsResponseModel,
  ConstructionProjectsProjectResponseModel,
  CreateConstructionProjectsProjectRequestModel,
  UpdateConstructionProjectsProjectRequestModel,
  ListConstructionProjectsProjectOptionsResponseModel,
  ListConstructionProjectsCustomFieldLabelsResponseModel,
};

/** The projects context's routes (CM-204, CM-413). */
export const projectsOpenApiOperations: OpenApiOperation[] = [
  {
    method: "get",
    path: BASE,
    summary:
      "Projects home: the Projects you may see (Owner all, Member assigned), by status then name, with counts per status",
    tags: PROJECTS,
    query: ListConstructionProjectsProjectsQueryModel,
    successStatus: StatusCodes.OK,
    successDescription: "Projects and the filter-chip counts",
    successSchema: ListConstructionProjectsProjectsResponseModel,
    errors: [StatusCodes.BAD_REQUEST, ...SESSION_ERRORS],
  },
  {
    method: "post",
    path: BASE,
    summary:
      "Add a Project with optional contract details and custom fields (402 PLAN_LIMIT_EXCEEDED beyond the plan; 409 PROJECT_NAME_IN_USE)",
    tags: PROJECTS,
    body: CreateConstructionProjectsProjectRequestModel,
    successStatus: StatusCodes.CREATED,
    successDescription: "The new Project",
    successSchema: ConstructionProjectsProjectResponseModel,
    errors: [
      StatusCodes.BAD_REQUEST,
      ...SESSION_ERRORS,
      StatusCodes.CONFLICT,
      StatusCodes.PAYMENT_REQUIRED,
    ],
  },
  {
    method: "get",
    path: `${BASE}/options`,
    summary:
      "Projects for pickers (id, name, status) with the same visibility as the list; open to every Team Member",
    tags: PROJECTS,
    successStatus: StatusCodes.OK,
    successDescription: "Project options",
    successSchema: ListConstructionProjectsProjectOptionsResponseModel,
    errors: [...SESSION_ERRORS],
  },
  {
    method: "get",
    path: `${BASE}/custom-field-labels`,
    summary:
      "Custom-field labels used on the Company's live Projects, grouped ignoring case, most used first (at most 50)",
    tags: PROJECTS,
    successStatus: StatusCodes.OK,
    successDescription: "Labels for the custom-field name picker",
    successSchema: ListConstructionProjectsCustomFieldLabelsResponseModel,
    errors: [...SESSION_ERRORS],
  },
  {
    method: "get",
    path: `${BASE}/{id}`,
    summary: "One Project (404 for a Member not assigned to it)",
    tags: PROJECTS,
    params: ConstructionProjectsProjectParamsModel,
    successStatus: StatusCodes.OK,
    successDescription: "The Project",
    successSchema: ConstructionProjectsProjectResponseModel,
    errors: [StatusCodes.BAD_REQUEST, ...SESSION_ERRORS, StatusCodes.NOT_FOUND],
  },
  {
    method: "post",
    path: `${BASE}/{id}/update`,
    summary:
      "Edit a Project; contract details or custom fields left out are kept (409 PROJECT_CHANGED when expectedUpdatedAt is stale, PROJECT_NAME_IN_USE)",
    tags: PROJECTS,
    params: ConstructionProjectsProjectParamsModel,
    body: UpdateConstructionProjectsProjectRequestModel,
    successStatus: StatusCodes.OK,
    successDescription: "The updated Project",
    successSchema: ConstructionProjectsProjectResponseModel,
    errors: [
      StatusCodes.BAD_REQUEST,
      ...SESSION_ERRORS,
      StatusCodes.NOT_FOUND,
      StatusCodes.CONFLICT,
      StatusCodes.PAYMENT_REQUIRED,
    ],
  },
  {
    method: "post",
    path: `${BASE}/{id}/delete`,
    summary:
      "Delete a Project (409 PROJECT_IN_USE while labours, vendors, attendance, payments or documents point at it)",
    tags: PROJECTS,
    params: ConstructionProjectsProjectParamsModel,
    successStatus: StatusCodes.NO_CONTENT,
    successDescription: "Deleted",
    errors: [
      StatusCodes.BAD_REQUEST,
      ...SESSION_ERRORS,
      StatusCodes.NOT_FOUND,
      StatusCodes.CONFLICT,
      StatusCodes.PAYMENT_REQUIRED,
    ],
  },
];
