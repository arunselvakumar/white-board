import { StatusCodes } from "http-status-codes";

import type {
  OpenApiComponents,
  OpenApiOperation,
} from "@/app/api/_lib/openapi";

import {
  ConstructionMastersIdParamsModel,
  ListConstructionMastersQueryModel,
} from "../_lib/master-models";
import {
  ConstructionMastersSiteEngineerCreatedResponseModel,
  ConstructionMastersSiteEngineerPasswordResponseModel,
  ConstructionMastersSiteEngineerResponseModel,
  CreateConstructionMastersSiteEngineerRequestModel,
  ListConstructionMastersSiteEngineersResponseModel,
  SetConstructionMastersSiteEngineerPasswordRequestModel,
  UpdateConstructionMastersSiteEngineerRequestModel,
} from "./site-engineer-models";

const TAGS = ["Construction · Masters"];
const PATH = "/api/construction/masters/site-engineers";
const SESSION = [StatusCodes.UNAUTHORIZED, StatusCodes.FORBIDDEN] as const;
const WRITE = [
  StatusCodes.BAD_REQUEST,
  ...SESSION,
  StatusCodes.PAYMENT_REQUIRED,
] as const;
const params = ConstructionMastersIdParamsModel;

export const siteEngineerOpenApiComponents: OpenApiComponents = {
  ConstructionMastersSiteEngineerResponseModel,
  ListConstructionMastersSiteEngineersResponseModel,
  CreateConstructionMastersSiteEngineerRequestModel,
  ConstructionMastersSiteEngineerCreatedResponseModel,
  UpdateConstructionMastersSiteEngineerRequestModel,
  SetConstructionMastersSiteEngineerPasswordRequestModel,
  ConstructionMastersSiteEngineerPasswordResponseModel,
};

/** Site Engineers with a page of their own and a sign-in (ADR CM-0037). */
export const siteEngineerOpenApiOperations: OpenApiOperation[] = [
  {
    method: "get",
    path: PATH,
    summary:
      "Every live Site Engineer by name, with how each signs in; disabled ones too unless `status=enabled` (menu `masters.labours`, read)",
    tags: TAGS,
    query: ListConstructionMastersQueryModel,
    successStatus: StatusCodes.OK,
    successDescription: "Site Engineers",
    successSchema: ListConstructionMastersSiteEngineersResponseModel,
    errors: [StatusCodes.BAD_REQUEST, ...SESSION],
  },
  {
    method: "post",
    path: PATH,
    summary:
      "Add a Site Engineer and their sign-in on the default Site Engineer Role (400 SIGN_IN_REQUIRED; 403 CANNOT_GRANT; 409 SUPERVISOR_NAME_IN_USE, SUPERVISOR_EMPLOYEE_CODE_IN_USE, SITE_ENGINEER_ROLE_MISSING)",
    tags: TAGS,
    body: CreateConstructionMastersSiteEngineerRequestModel,
    successStatus: StatusCodes.CREATED,
    successDescription: "The new Site Engineer, and whether a password was set",
    successSchema: ConstructionMastersSiteEngineerCreatedResponseModel,
    errors: [...WRITE, StatusCodes.CONFLICT],
  },
  {
    method: "get",
    path: `${PATH}/{id}`,
    summary: "One Site Engineer, enabled or disabled",
    tags: TAGS,
    params,
    successStatus: StatusCodes.OK,
    successDescription: "The Site Engineer",
    successSchema: ConstructionMastersSiteEngineerResponseModel,
    errors: [StatusCodes.BAD_REQUEST, ...SESSION, StatusCodes.NOT_FOUND],
  },
  {
    method: "post",
    path: `${PATH}/{id}/update`,
    summary:
      "Edit a Site Engineer with the `updatedAt` you loaded; one without a sign-in gets one now (400 SIGN_IN_REQUIRED; 409 SUPERVISOR_CHANGED)",
    tags: TAGS,
    params,
    body: UpdateConstructionMastersSiteEngineerRequestModel,
    successStatus: StatusCodes.OK,
    successDescription: "The updated Site Engineer",
    successSchema: ConstructionMastersSiteEngineerResponseModel,
    errors: [...WRITE, StatusCodes.NOT_FOUND, StatusCodes.CONFLICT],
  },
  {
    method: "post",
    path: `${PATH}/{id}/resend-invite`,
    summary:
      "Send their invitation again with a fresh link (409 SITE_ENGINEER_NO_SIGN_IN, MEMBER_EMAIL_REQUIRED)",
    tags: TAGS,
    params,
    successStatus: StatusCodes.OK,
    successDescription: "The Site Engineer",
    successSchema: ConstructionMastersSiteEngineerResponseModel,
    errors: [...WRITE, StatusCodes.NOT_FOUND, StatusCodes.CONFLICT],
  },
  {
    method: "post",
    path: `${PATH}/{id}/password`,
    summary:
      "Set a temporary password for their sign-in (403 CANNOT_GRANT, OWN_ROLE; 409 SITE_ENGINEER_NO_SIGN_IN, USER_IN_OTHER_COMPANY)",
    tags: TAGS,
    params,
    body: SetConstructionMastersSiteEngineerPasswordRequestModel,
    successStatus: StatusCodes.OK,
    successDescription: "The Site Engineer",
    successSchema: ConstructionMastersSiteEngineerPasswordResponseModel,
    errors: [...WRITE, StatusCodes.NOT_FOUND, StatusCodes.CONFLICT],
  },
  {
    method: "post",
    path: `${PATH}/{id}/delete`,
    summary:
      "Delete a Site Engineer and take back their own sign-in (409 SUPERVISOR_IN_USE while Labours or attendance name them)",
    tags: TAGS,
    params,
    successStatus: StatusCodes.NO_CONTENT,
    successDescription: "Deleted",
    errors: [...WRITE, StatusCodes.NOT_FOUND, StatusCodes.CONFLICT],
  },
];
