import { StatusCodes } from "http-status-codes";

import type {
  OpenApiComponents,
  OpenApiOperation,
} from "@/app/api/_lib/openapi";

import {
  GetConstructionSiteWorkAccessRequestModel,
  GetConstructionSiteWorkAccessResponseModel,
} from "./access-models";

export const siteWorkAccessOpenApiComponents: OpenApiComponents = {
  GetConstructionSiteWorkAccessResponseModel,
};

export const siteWorkAccessOpenApiOperations: OpenApiOperation[] = [
  {
    method: "get",
    path: "/api/construction/site-work/access",
    summary:
      "The site-work flags the caller holds, on a Project when given (M6)",
    tags: ["Construction · Site work"],
    query: GetConstructionSiteWorkAccessRequestModel,
    successStatus: StatusCodes.OK,
    successDescription: "Flags per site-work menu",
    successSchema: GetConstructionSiteWorkAccessResponseModel,
    errors: [
      StatusCodes.BAD_REQUEST,
      StatusCodes.UNAUTHORIZED,
      StatusCodes.FORBIDDEN,
    ],
  },
];
