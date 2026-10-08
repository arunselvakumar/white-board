import { StatusCodes } from "http-status-codes";

import { SwitchConstructionOrganizationCompanyParamsModel } from "@/app/api/construction/organization/companies/[id]/switch/switch-company-params-model";
import { SwitchConstructionOrganizationCompanyResponseModel } from "@/app/api/construction/organization/companies/[id]/switch/switch-company-response-model";
import { CreateConstructionOrganizationCompanyRequestModel } from "@/app/api/construction/organization/companies/create-company-request-model";
import { CreateConstructionOrganizationCompanyResponseModel } from "@/app/api/construction/organization/companies/create-company-response-model";
import { ListMyConstructionOrganizationCompaniesResponseModel } from "@/app/api/construction/organization/companies/me/list-my-companies-response-model";
import { GetConstructionOrganizationCompanyProfileResponseModel } from "@/app/api/construction/organization/company-profile/get-company-profile-response-model";
import { ConstructionOrganizationDesignationParamsModel } from "@/app/api/construction/organization/designations/[id]/designation-params-model";
import { DuplicateConstructionOrganizationDesignationRequestModel } from "@/app/api/construction/organization/designations/[id]/duplicate/duplicate-designation-request-model";
import { UpdateConstructionOrganizationDesignationRequestModel } from "@/app/api/construction/organization/designations/[id]/update/update-designation-request-model";
import { CreateConstructionOrganizationDesignationRequestModel } from "@/app/api/construction/organization/designations/create-designation-request-model";
import { ConstructionOrganizationDesignationResponseModel } from "@/app/api/construction/organization/designations/designation-response-model";
import { ListConstructionOrganizationDesignationsResponseModel } from "@/app/api/construction/organization/designations/list-designations-response-model";

import {
  buildOpenApiDocument,
  type OpenApiComponents,
  type OpenApiOperation,
} from "./openapi";

const ORGANIZATION = ["Construction · Organization"];

const SESSION_ERRORS = [
  StatusCodes.UNAUTHORIZED,
  StatusCodes.FORBIDDEN,
] as const;

/**
 * Every Request and Response model, keyed by its code name. Names are global
 * in `/api/docs`, so each carries `Construction<Context>` (ADR CM-0001).
 */
export const openApiComponents: OpenApiComponents = {
  CreateConstructionOrganizationCompanyRequestModel,
  CreateConstructionOrganizationCompanyResponseModel,
  ListMyConstructionOrganizationCompaniesResponseModel,
  SwitchConstructionOrganizationCompanyResponseModel,
  GetConstructionOrganizationCompanyProfileResponseModel,
  ListConstructionOrganizationDesignationsResponseModel,
  ConstructionOrganizationDesignationResponseModel,
  CreateConstructionOrganizationDesignationRequestModel,
  UpdateConstructionOrganizationDesignationRequestModel,
  DuplicateConstructionOrganizationDesignationRequestModel,
};

const DESIGNATIONS = "/api/construction/organization/designations";

/** Every route. A route is unfinished until it is listed here (root ADR-0012). */
export const openApiOperations: OpenApiOperation[] = [
  {
    method: "post",
    path: "/api/construction/organization/companies",
    summary: "Create a Company with the caller as Owner and make it active",
    tags: ORGANIZATION,
    body: CreateConstructionOrganizationCompanyRequestModel,
    successStatus: StatusCodes.CREATED,
    successDescription: "The Company, on a 14-day trial",
    successSchema: CreateConstructionOrganizationCompanyResponseModel,
    errors: [StatusCodes.BAD_REQUEST, StatusCodes.UNAUTHORIZED],
  },
  {
    method: "get",
    path: "/api/construction/organization/companies/me",
    summary: "The signed-in User's Companies",
    tags: ORGANIZATION,
    successStatus: StatusCodes.OK,
    successDescription: "Companies and the Active Company",
    successSchema: ListMyConstructionOrganizationCompaniesResponseModel,
    errors: [StatusCodes.UNAUTHORIZED],
  },
  {
    method: "post",
    path: "/api/construction/organization/companies/{id}/switch",
    summary: "Make one of the caller's Companies active",
    tags: ORGANIZATION,
    params: SwitchConstructionOrganizationCompanyParamsModel,
    successStatus: StatusCodes.OK,
    successDescription: "The new Active Company",
    successSchema: SwitchConstructionOrganizationCompanyResponseModel,
    errors: [StatusCodes.UNAUTHORIZED, StatusCodes.NOT_FOUND],
  },
  {
    method: "get",
    path: "/api/construction/organization/company-profile",
    summary: "The Active Company's profile",
    tags: ORGANIZATION,
    successStatus: StatusCodes.OK,
    successDescription: "The Company profile",
    successSchema: GetConstructionOrganizationCompanyProfileResponseModel,
    errors: [...SESSION_ERRORS, StatusCodes.NOT_FOUND],
  },
  {
    method: "get",
    path: DESIGNATIONS,
    summary:
      "Every live Designation of the Active Company, by name (a few dozen, so not paged)",
    tags: ORGANIZATION,
    successStatus: StatusCodes.OK,
    successDescription: "Designations and their Permission Templates",
    successSchema: ListConstructionOrganizationDesignationsResponseModel,
    errors: [...SESSION_ERRORS],
  },
  {
    method: "post",
    path: DESIGNATIONS,
    summary:
      "Add a Designation, optionally with a Permission Template (unsupported cells are dropped)",
    tags: ORGANIZATION,
    body: CreateConstructionOrganizationDesignationRequestModel,
    successStatus: StatusCodes.CREATED,
    successDescription: "The new Designation",
    successSchema: ConstructionOrganizationDesignationResponseModel,
    errors: [StatusCodes.BAD_REQUEST, ...SESSION_ERRORS, StatusCodes.CONFLICT],
  },
  {
    method: "get",
    path: `${DESIGNATIONS}/{id}`,
    summary: "One Designation with its Permission Template",
    tags: ORGANIZATION,
    params: ConstructionOrganizationDesignationParamsModel,
    successStatus: StatusCodes.OK,
    successDescription: "The Designation",
    successSchema: ConstructionOrganizationDesignationResponseModel,
    errors: [StatusCodes.BAD_REQUEST, ...SESSION_ERRORS, StatusCodes.NOT_FOUND],
  },
  {
    method: "post",
    path: `${DESIGNATIONS}/{id}/update`,
    summary:
      "Rename a Designation and replace its Permission Template (null or {} removes it)",
    tags: ORGANIZATION,
    params: ConstructionOrganizationDesignationParamsModel,
    body: UpdateConstructionOrganizationDesignationRequestModel,
    successStatus: StatusCodes.OK,
    successDescription: "The updated Designation",
    successSchema: ConstructionOrganizationDesignationResponseModel,
    errors: [
      StatusCodes.BAD_REQUEST,
      ...SESSION_ERRORS,
      StatusCodes.NOT_FOUND,
      StatusCodes.CONFLICT,
    ],
  },
  {
    method: "post",
    path: `${DESIGNATIONS}/{id}/duplicate`,
    summary:
      'Copy a Designation with its Permission Template (name defaults to "<name> (copy)")',
    tags: ORGANIZATION,
    params: ConstructionOrganizationDesignationParamsModel,
    body: DuplicateConstructionOrganizationDesignationRequestModel,
    successStatus: StatusCodes.CREATED,
    successDescription: "The copy",
    successSchema: ConstructionOrganizationDesignationResponseModel,
    errors: [
      StatusCodes.BAD_REQUEST,
      ...SESSION_ERRORS,
      StatusCodes.NOT_FOUND,
      StatusCodes.CONFLICT,
    ],
  },
  {
    method: "post",
    path: `${DESIGNATIONS}/{id}/delete`,
    summary:
      "Delete a Designation (409 DESIGNATION_IN_USE while a Team Member holds it)",
    tags: ORGANIZATION,
    params: ConstructionOrganizationDesignationParamsModel,
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

export const openApiDocument = buildOpenApiDocument(
  openApiOperations,
  openApiComponents,
);
