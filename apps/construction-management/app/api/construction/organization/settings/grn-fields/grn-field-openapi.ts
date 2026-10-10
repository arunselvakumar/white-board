import { StatusCodes } from "http-status-codes";

import type {
  OpenApiComponents,
  OpenApiOperation,
} from "@/app/api/_lib/openapi";

import {
  GetConstructionOrganizationGrnFieldSettingResponseModel,
  GRN_FIELDS_PATH,
  UpdateConstructionOrganizationGrnFieldSettingRequestModel,
} from "./grn-field-setting-models";

const ORGANIZATION = ["Construction · Organization"];

const SESSION_ERRORS = [StatusCodes.UNAUTHORIZED, StatusCodes.FORBIDDEN];

/** GRN field visibility (CM-501, ADR CM-0015 §9), under `organization.settings`. */
export const grnFieldOpenApiComponents: OpenApiComponents = {
  GetConstructionOrganizationGrnFieldSettingResponseModel,
  UpdateConstructionOrganizationGrnFieldSettingRequestModel,
};

export const grnFieldOpenApiOperations: OpenApiOperation[] = [
  {
    method: "get",
    path: GRN_FIELDS_PATH,
    summary: "Which optional GRN fields the Company hides",
    tags: ORGANIZATION,
    successStatus: StatusCodes.OK,
    successDescription: "Hidden fields and every optional field with its group",
    successSchema: GetConstructionOrganizationGrnFieldSettingResponseModel,
    errors: [...SESSION_ERRORS],
  },
  {
    method: "post",
    path: `${GRN_FIELDS_PATH}/update`,
    summary: "Replace the list of hidden GRN fields",
    tags: ORGANIZATION,
    body: UpdateConstructionOrganizationGrnFieldSettingRequestModel,
    successStatus: StatusCodes.OK,
    successDescription: "The saved setting",
    successSchema: GetConstructionOrganizationGrnFieldSettingResponseModel,
    errors: [StatusCodes.BAD_REQUEST, ...SESSION_ERRORS, StatusCodes.CONFLICT],
  },
];
