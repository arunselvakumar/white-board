import { StatusCodes } from "http-status-codes";

import { GetConstructionOrganizationCompanyProfileResponseModel } from "@/app/api/construction/organization/company-profile/get-company-profile-response-model";

import {
  buildOpenApiDocument,
  type OpenApiComponents,
  type OpenApiOperation,
} from "./openapi";

const SESSION_ERRORS = [
  StatusCodes.UNAUTHORIZED,
  StatusCodes.FORBIDDEN,
] as const;

/**
 * Every Request and Response model, keyed by its code name. Names are global
 * in `/api/docs`, so each carries `Construction<Context>` (ADR CM-0001).
 */
export const openApiComponents: OpenApiComponents = {
  GetConstructionOrganizationCompanyProfileResponseModel,
};

/** Every route. A route is unfinished until it is listed here (root ADR-0012). */
export const openApiOperations: OpenApiOperation[] = [
  {
    method: "get",
    path: "/api/construction/organization/company-profile",
    summary: "The Active Company's profile",
    tags: ["Construction · Organization"],
    successStatus: StatusCodes.OK,
    successDescription: "The Company profile",
    successSchema: GetConstructionOrganizationCompanyProfileResponseModel,
    errors: [...SESSION_ERRORS, StatusCodes.NOT_FOUND],
  },
];

export const openApiDocument = buildOpenApiDocument(
  openApiOperations,
  openApiComponents,
);
