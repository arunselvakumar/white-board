import { StatusCodes } from "http-status-codes";

import type {
  OpenApiComponents,
  OpenApiOperation,
} from "@/app/api/_lib/openapi";

import {
  ConstructionOrganizationRoleParamsModel,
  ConstructionOrganizationRoleResponseModel,
  CreateConstructionOrganizationRoleRequestModel,
  ListConstructionOrganizationRolesResponseModel,
  ROLES_PATH,
  UpdateConstructionOrganizationRoleRequestModel,
} from "./role-models";

const ORGANIZATION = ["Construction · Organization"];

const SESSION_ERRORS = [StatusCodes.UNAUTHORIZED, StatusCodes.FORBIDDEN];

const ITEM = `${ROLES_PATH}/{id}`;

/** Role Management (ADR CM-0030), under `organization.roles`. */
export const roleOpenApiComponents: OpenApiComponents = {
  ConstructionOrganizationRoleResponseModel,
  ListConstructionOrganizationRolesResponseModel,
  CreateConstructionOrganizationRoleRequestModel,
  UpdateConstructionOrganizationRoleRequestModel,
};

export const roleOpenApiOperations: OpenApiOperation[] = [
  {
    method: "get",
    path: ROLES_PATH,
    summary:
      "Every live Role of the Active Company, by name (organization.roles or organization.team_members read)",
    tags: ORGANIZATION,
    successStatus: StatusCodes.OK,
    successDescription: "Roles with their matrices and how many Users each",
    successSchema: ListConstructionOrganizationRolesResponseModel,
    errors: [...SESSION_ERRORS],
  },
  {
    method: "post",
    path: ROLES_PATH,
    summary:
      "Add a Role (409 ROLE_NAME_TAKEN; 403 CANNOT_GRANT for a cell the caller lacks)",
    tags: ORGANIZATION,
    body: CreateConstructionOrganizationRoleRequestModel,
    successStatus: StatusCodes.CREATED,
    successDescription: "The new Role",
    successSchema: ConstructionOrganizationRoleResponseModel,
    errors: [StatusCodes.BAD_REQUEST, ...SESSION_ERRORS, StatusCodes.CONFLICT],
  },
  {
    method: "get",
    path: ITEM,
    summary: "One Role with its matrix",
    tags: ORGANIZATION,
    params: ConstructionOrganizationRoleParamsModel,
    successStatus: StatusCodes.OK,
    successDescription: "The Role",
    successSchema: ConstructionOrganizationRoleResponseModel,
    errors: [StatusCodes.BAD_REQUEST, ...SESSION_ERRORS, StatusCodes.NOT_FOUND],
  },
  {
    method: "post",
    path: `${ITEM}/update`,
    summary:
      "Replace a Role's name, description and matrix; everyone on it has the new access from their next request (409 STALE_ROLE; 403 OWN_ROLE, CANNOT_GRANT)",
    tags: ORGANIZATION,
    params: ConstructionOrganizationRoleParamsModel,
    body: UpdateConstructionOrganizationRoleRequestModel,
    successStatus: StatusCodes.OK,
    successDescription: "The updated Role",
    successSchema: ConstructionOrganizationRoleResponseModel,
    errors: [
      StatusCodes.BAD_REQUEST,
      ...SESSION_ERRORS,
      StatusCodes.NOT_FOUND,
      StatusCodes.CONFLICT,
    ],
  },
  {
    method: "post",
    path: `${ITEM}/duplicate`,
    summary: 'Copy a Role as "<name> (copy)", with nobody on it',
    tags: ORGANIZATION,
    params: ConstructionOrganizationRoleParamsModel,
    successStatus: StatusCodes.CREATED,
    successDescription: "The copy",
    successSchema: ConstructionOrganizationRoleResponseModel,
    errors: [
      StatusCodes.BAD_REQUEST,
      ...SESSION_ERRORS,
      StatusCodes.NOT_FOUND,
      StatusCodes.CONFLICT,
    ],
  },
  {
    method: "post",
    path: `${ITEM}/delete`,
    summary:
      "Delete a Role (409 ROLE_IN_USE with `{ userCount }` while anyone is on it)",
    tags: ORGANIZATION,
    params: ConstructionOrganizationRoleParamsModel,
    successStatus: StatusCodes.NO_CONTENT,
    successDescription: "Deleted",
    errors: [
      StatusCodes.BAD_REQUEST,
      ...SESSION_ERRORS,
      StatusCodes.NOT_FOUND,
      StatusCodes.CONFLICT,
    ],
  },
];
