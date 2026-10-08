import { StatusCodes } from "http-status-codes";

import { SwitchConstructionOrganizationCompanyParamsModel } from "@/app/api/construction/organization/companies/[id]/switch/switch-company-params-model";
import { SwitchConstructionOrganizationCompanyResponseModel } from "@/app/api/construction/organization/companies/[id]/switch/switch-company-response-model";
import { CreateConstructionOrganizationCompanyRequestModel } from "@/app/api/construction/organization/companies/create-company-request-model";
import { CreateConstructionOrganizationCompanyResponseModel } from "@/app/api/construction/organization/companies/create-company-response-model";
import { ListMyConstructionOrganizationCompaniesResponseModel } from "@/app/api/construction/organization/companies/me/list-my-companies-response-model";
import { GetConstructionOrganizationCompanyProfileResponseModel } from "@/app/api/construction/organization/company-profile/get-company-profile-response-model";
import { UpdateConstructionOrganizationCompanyProfileRequestModel } from "@/app/api/construction/organization/company-profile/update/update-company-profile-request-model";
import { GetConstructionOrganizationMyProfileResponseModel } from "@/app/api/construction/organization/me/profile/get-my-profile-response-model";
import { RevealConstructionOrganizationMyIdentifiersResponseModel } from "@/app/api/construction/organization/me/profile/reveal-identifiers/reveal-my-identifiers-response-model";
import { UpdateConstructionOrganizationMyProfileRequestModel } from "@/app/api/construction/organization/me/profile/update/update-my-profile-request-model";
import { IMAGE_CONTENT_TYPES } from "@/src/shared-kernel/files";

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
  UpdateConstructionOrganizationCompanyProfileRequestModel,
  GetConstructionOrganizationMyProfileResponseModel,
  UpdateConstructionOrganizationMyProfileRequestModel,
  RevealConstructionOrganizationMyIdentifiersResponseModel,
};

const IMAGE_TYPES = [...IMAGE_CONTENT_TYPES];

const UPLOAD_ERRORS = [
  StatusCodes.BAD_REQUEST,
  StatusCodes.UNAUTHORIZED,
  StatusCodes.FORBIDDEN,
  StatusCodes.NOT_FOUND,
  StatusCodes.CONFLICT,
] as const;

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
    summary: "The Active Company's profile (Settings read)",
    tags: ORGANIZATION,
    successStatus: StatusCodes.OK,
    successDescription: "The Company profile",
    successSchema: GetConstructionOrganizationCompanyProfileResponseModel,
    errors: [...SESSION_ERRORS, StatusCodes.NOT_FOUND],
  },
  {
    method: "post",
    path: "/api/construction/organization/company-profile/update",
    summary:
      "Change the Company's name, contact, GSTIN, PAN, address, currency and time zone (Settings update; the country is fixed)",
    tags: ORGANIZATION,
    body: UpdateConstructionOrganizationCompanyProfileRequestModel,
    successStatus: StatusCodes.OK,
    successDescription: "The updated Company profile",
    successSchema: GetConstructionOrganizationCompanyProfileResponseModel,
    errors: [
      StatusCodes.BAD_REQUEST,
      ...SESSION_ERRORS,
      StatusCodes.NOT_FOUND,
      StatusCodes.CONFLICT,
    ],
  },
  {
    method: "get",
    path: "/api/construction/organization/company-profile/logo",
    summary: "The Company logo, for the Company's Team Members",
    tags: ORGANIZATION,
    successStatus: StatusCodes.OK,
    successDescription: "The logo image",
    successBinaryContentTypes: IMAGE_TYPES,
    errors: [...SESSION_ERRORS, StatusCodes.NOT_FOUND],
  },
  {
    method: "post",
    path: "/api/construction/organization/company-profile/logo",
    summary:
      "Set or replace the Company logo: the image as the body, PNG, JPEG or WebP, at most 2 MB (Settings update)",
    tags: ORGANIZATION,
    bodyBinaryContentTypes: IMAGE_TYPES,
    successStatus: StatusCodes.OK,
    successDescription: "The Company profile with its new logo",
    successSchema: GetConstructionOrganizationCompanyProfileResponseModel,
    errors: [...UPLOAD_ERRORS],
  },
  {
    method: "post",
    path: "/api/construction/organization/company-profile/logo/remove",
    summary: "Remove the Company logo (Settings update)",
    tags: ORGANIZATION,
    successStatus: StatusCodes.OK,
    successDescription: "The Company profile without a logo",
    successSchema: GetConstructionOrganizationCompanyProfileResponseModel,
    errors: [...SESSION_ERRORS, StatusCodes.NOT_FOUND, StatusCodes.CONFLICT],
  },
  {
    method: "get",
    path: "/api/construction/organization/me/profile",
    summary: "My Profile: the caller's own Team Member record",
    tags: ORGANIZATION,
    successStatus: StatusCodes.OK,
    successDescription: "The caller's Team Member record, ids masked",
    successSchema: GetConstructionOrganizationMyProfileResponseModel,
    errors: [...SESSION_ERRORS, StatusCodes.NOT_FOUND],
  },
  {
    method: "post",
    path: "/api/construction/organization/me/profile/update",
    summary:
      "Change the caller's own name, email, address, emergency contact, Aadhaar and PAN",
    tags: ORGANIZATION,
    body: UpdateConstructionOrganizationMyProfileRequestModel,
    successStatus: StatusCodes.OK,
    successDescription: "The updated record",
    successSchema: GetConstructionOrganizationMyProfileResponseModel,
    errors: [
      StatusCodes.BAD_REQUEST,
      ...SESSION_ERRORS,
      StatusCodes.NOT_FOUND,
      StatusCodes.CONFLICT,
    ],
  },
  {
    method: "post",
    path: "/api/construction/organization/me/profile/reveal-identifiers",
    summary:
      "The caller's own Aadhaar and PAN in full (audited; an OTP step arrives with M9)",
    tags: ORGANIZATION,
    successStatus: StatusCodes.OK,
    successDescription: "Aadhaar and PAN",
    successSchema: RevealConstructionOrganizationMyIdentifiersResponseModel,
    errors: [...SESSION_ERRORS, StatusCodes.NOT_FOUND],
  },
  {
    method: "get",
    path: "/api/construction/organization/me/photo",
    summary: "The caller's own photo",
    tags: ORGANIZATION,
    successStatus: StatusCodes.OK,
    successDescription: "The photo image",
    successBinaryContentTypes: IMAGE_TYPES,
    errors: [...SESSION_ERRORS, StatusCodes.NOT_FOUND],
  },
  {
    method: "post",
    path: "/api/construction/organization/me/photo",
    summary:
      "Set or replace the caller's photo: the image as the body, PNG, JPEG or WebP, at most 10 MB",
    tags: ORGANIZATION,
    bodyBinaryContentTypes: IMAGE_TYPES,
    successStatus: StatusCodes.OK,
    successDescription: "The caller's record with the new photo",
    successSchema: GetConstructionOrganizationMyProfileResponseModel,
    errors: [...UPLOAD_ERRORS],
  },
  {
    method: "post",
    path: "/api/construction/organization/me/photo/remove",
    summary: "Remove the caller's photo",
    tags: ORGANIZATION,
    successStatus: StatusCodes.OK,
    successDescription: "The caller's record without a photo",
    successSchema: GetConstructionOrganizationMyProfileResponseModel,
    errors: [...SESSION_ERRORS, StatusCodes.NOT_FOUND, StatusCodes.CONFLICT],
  },
];

export const openApiDocument = buildOpenApiDocument(
  openApiOperations,
  openApiComponents,
);
