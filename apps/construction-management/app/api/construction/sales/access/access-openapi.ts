import { StatusCodes } from "http-status-codes";

import type {
  OpenApiComponents,
  OpenApiOperation,
} from "@/app/api/_lib/openapi";

import {
  GetConstructionSalesAccessRequestModel,
  GetConstructionSalesAccessResponseModel,
} from "./access-models";

export const salesAccessOpenApiComponents: OpenApiComponents = {
  GetConstructionSalesAccessResponseModel,
};

export const salesAccessOpenApiOperations: OpenApiOperation[] = [
  {
    method: "get",
    path: "/api/construction/sales/access",
    summary: "The sales flags the caller holds on a Project (M10)",
    tags: ["Construction · Sales"],
    query: GetConstructionSalesAccessRequestModel,
    successStatus: StatusCodes.OK,
    successDescription: "Flags per sales menu",
    successSchema: GetConstructionSalesAccessResponseModel,
    errors: [
      StatusCodes.BAD_REQUEST,
      StatusCodes.UNAUTHORIZED,
      StatusCodes.FORBIDDEN,
      StatusCodes.NOT_FOUND,
    ],
  },
];
