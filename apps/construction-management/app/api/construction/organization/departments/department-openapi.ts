import { StatusCodes } from "http-status-codes";

import type {
  OpenApiComponents,
  OpenApiOperation,
} from "@/app/api/_lib/openapi";

import {
  ConstructionOrganizationDepartmentParamsModel,
  ConstructionOrganizationDepartmentResponseModel,
  CreateConstructionOrganizationDepartmentRequestModel,
  DEPARTMENTS_PATH,
  ListConstructionOrganizationDepartmentsResponseModel,
  UpdateConstructionOrganizationDepartmentRequestModel,
} from "./department-models";

const ORGANIZATION = ["Construction · Organization"];

const SESSION_ERRORS = [StatusCodes.UNAUTHORIZED, StatusCodes.FORBIDDEN];

const ITEM = `${DEPARTMENTS_PATH}/{id}`;

/** Manage Departments (ADR CM-0049), under `organization.departments`. */
export const departmentOpenApiComponents: OpenApiComponents = {
  ConstructionOrganizationDepartmentResponseModel,
  ListConstructionOrganizationDepartmentsResponseModel,
  CreateConstructionOrganizationDepartmentRequestModel,
  UpdateConstructionOrganizationDepartmentRequestModel,
};

export const departmentOpenApiOperations: OpenApiOperation[] = [
  {
    method: "get",
    path: DEPARTMENTS_PATH,
    summary:
      "Every live department of the Active Company, by name (organization.departments read)",
    tags: ORGANIZATION,
    successStatus: StatusCodes.OK,
    successDescription: "Departments, the system ones marked",
    successSchema: ListConstructionOrganizationDepartmentsResponseModel,
    errors: [...SESSION_ERRORS],
  },
  {
    method: "post",
    path: DEPARTMENTS_PATH,
    summary: "Add a department (409 DEPARTMENT_NAME_TAKEN, any case)",
    tags: ORGANIZATION,
    body: CreateConstructionOrganizationDepartmentRequestModel,
    successStatus: StatusCodes.CREATED,
    successDescription: "The new department",
    successSchema: ConstructionOrganizationDepartmentResponseModel,
    errors: [StatusCodes.BAD_REQUEST, ...SESSION_ERRORS, StatusCodes.CONFLICT],
  },
  {
    method: "post",
    path: `${ITEM}/update`,
    summary:
      "Rename a Company-made department (400 DEPARTMENT_SYSTEM_LOCKED; 409 STALE_DEPARTMENT, DEPARTMENT_NAME_TAKEN)",
    tags: ORGANIZATION,
    params: ConstructionOrganizationDepartmentParamsModel,
    body: UpdateConstructionOrganizationDepartmentRequestModel,
    successStatus: StatusCodes.OK,
    successDescription: "The renamed department",
    successSchema: ConstructionOrganizationDepartmentResponseModel,
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
      "Delete a Company-made department (409 DEPARTMENT_IS_SYSTEM for Human Resources and Marketing)",
    tags: ORGANIZATION,
    params: ConstructionOrganizationDepartmentParamsModel,
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
