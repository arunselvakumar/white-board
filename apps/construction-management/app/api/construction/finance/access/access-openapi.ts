import { StatusCodes } from "http-status-codes";

import type {
  OpenApiComponents,
  OpenApiOperation,
} from "@/app/api/_lib/openapi";

import {
  GetConstructionFinanceAccessRequestModel,
  GetConstructionFinanceAccessResponseModel,
} from "./access-models";

export const financeAccessOpenApiComponents: OpenApiComponents = {
  GetConstructionFinanceAccessResponseModel,
};

export const financeAccessOpenApiOperations: OpenApiOperation[] = [
  {
    method: "get",
    path: "/api/construction/finance/access",
    summary: "The finance flags the caller holds, on a Project when given (M7)",
    tags: ["Construction · Finance"],
    query: GetConstructionFinanceAccessRequestModel,
    successStatus: StatusCodes.OK,
    successDescription: "Flags per finance menu",
    successSchema: GetConstructionFinanceAccessResponseModel,
    errors: [
      StatusCodes.BAD_REQUEST,
      StatusCodes.UNAUTHORIZED,
      StatusCodes.FORBIDDEN,
    ],
  },
];
