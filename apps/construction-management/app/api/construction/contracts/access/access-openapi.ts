import { StatusCodes } from "http-status-codes";

import type {
  OpenApiComponents,
  OpenApiOperation,
} from "@/app/api/_lib/openapi";

import {
  GetConstructionContractsAccessRequestModel,
  GetConstructionContractsAccessResponseModel,
} from "./access-models";

export const contractsAccessOpenApiComponents: OpenApiComponents = {
  GetConstructionContractsAccessResponseModel,
};

export const contractsAccessOpenApiOperations: OpenApiOperation[] = [
  {
    method: "get",
    path: "/api/construction/contracts/access",
    summary: "The contracts flags the caller holds on a Project (M11)",
    tags: ["Construction · Contracts"],
    query: GetConstructionContractsAccessRequestModel,
    successStatus: StatusCodes.OK,
    successDescription: "Flags per contracts menu",
    successSchema: GetConstructionContractsAccessResponseModel,
    errors: [
      StatusCodes.BAD_REQUEST,
      StatusCodes.UNAUTHORIZED,
      StatusCodes.FORBIDDEN,
      StatusCodes.NOT_FOUND,
    ],
  },
];
