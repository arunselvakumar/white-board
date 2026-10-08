import { StatusCodes } from "http-status-codes";

import { SwitchConstructionOrganizationCompanyParamsModel } from "@/app/api/construction/organization/companies/[id]/switch/switch-company-params-model";
import { SwitchConstructionOrganizationCompanyResponseModel } from "@/app/api/construction/organization/companies/[id]/switch/switch-company-response-model";
import { CreateConstructionOrganizationCompanyRequestModel } from "@/app/api/construction/organization/companies/create-company-request-model";
import { CreateConstructionOrganizationCompanyResponseModel } from "@/app/api/construction/organization/companies/create-company-response-model";
import { ListMyConstructionOrganizationCompaniesResponseModel } from "@/app/api/construction/organization/companies/me/list-my-companies-response-model";
import { GetConstructionOrganizationCompanyProfileResponseModel } from "@/app/api/construction/organization/company-profile/get-company-profile-response-model";
import {
  GetConstructionOrganizationJoinLinkResponseModel,
  JoinLinkTokenParamsModel,
} from "@/app/api/construction/organization/join-links/[token]/join-link-models";
import {
  AcceptConstructionOrganizationJoinRequestResponseModel,
  JoinRequestIdParamsModel,
  ListConstructionOrganizationJoinRequestsResponseModel,
} from "@/app/api/construction/organization/join-requests/join-request-models";

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
  ListConstructionOrganizationJoinRequestsResponseModel,
  AcceptConstructionOrganizationJoinRequestResponseModel,
  GetConstructionOrganizationJoinLinkResponseModel,
};

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
];

openApiOperations.push(
  {
    method: "get",
    path: "/api/construction/organization/join-requests",
    summary: "Join Requests for the signed-in User's verified mobile or email",
    tags: ORGANIZATION,
    successStatus: StatusCodes.OK,
    successDescription: "Pending Join Requests",
    successSchema: ListConstructionOrganizationJoinRequestsResponseModel,
    errors: [StatusCodes.UNAUTHORIZED],
  },
  {
    method: "post",
    path: "/api/construction/organization/join-requests/{id}/accept",
    summary: "Accept a Join Request and make that Company active",
    tags: ORGANIZATION,
    params: JoinRequestIdParamsModel,
    successStatus: StatusCodes.OK,
    successDescription: "Joined",
    successSchema: AcceptConstructionOrganizationJoinRequestResponseModel,
    errors: [
      StatusCodes.UNAUTHORIZED,
      StatusCodes.NOT_FOUND,
      StatusCodes.CONFLICT,
    ],
  },
  {
    method: "post",
    path: "/api/construction/organization/join-requests/{id}/reject",
    summary: "Decline a Join Request",
    tags: ORGANIZATION,
    params: JoinRequestIdParamsModel,
    successStatus: StatusCodes.NO_CONTENT,
    successDescription: "Declined",
    errors: [StatusCodes.UNAUTHORIZED, StatusCodes.NOT_FOUND],
  },
  {
    method: "get",
    path: "/api/construction/organization/join-links/{token}",
    summary: "What an invite link shows before sign-in",
    tags: ORGANIZATION,
    security: false,
    params: JoinLinkTokenParamsModel,
    successStatus: StatusCodes.OK,
    successDescription: "The Company and who the request is for, masked",
    successSchema: GetConstructionOrganizationJoinLinkResponseModel,
    errors: [StatusCodes.BAD_REQUEST, StatusCodes.NOT_FOUND],
  },
);

export const openApiDocument = buildOpenApiDocument(
  openApiOperations,
  openApiComponents,
);
