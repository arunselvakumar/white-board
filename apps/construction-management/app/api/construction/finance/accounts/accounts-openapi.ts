import { StatusCodes } from "http-status-codes";

import type {
  OpenApiComponents,
  OpenApiOperation,
} from "@/app/api/_lib/openapi";

import {
  ConstructionFinanceAccountOptionModel,
  GetConstructionFinanceAccountOptionsRequestModel,
  GetConstructionFinanceAccountOptionsResponseModel,
} from "./account-models";

export const financeAccountOpenApiComponents: OpenApiComponents = {
  ConstructionFinanceAccountOptionModel,
  GetConstructionFinanceAccountOptionsResponseModel,
};

export const financeAccountOpenApiOperations: OpenApiOperation[] = [
  {
    method: "get",
    path: "/api/construction/finance/accounts/options",
    summary: "Accounts the caller may pay from, for the account picker (M7)",
    tags: ["Construction · Finance"],
    query: GetConstructionFinanceAccountOptionsRequestModel,
    successStatus: StatusCodes.OK,
    successDescription: "Usable accounts, primary first",
    successSchema: GetConstructionFinanceAccountOptionsResponseModel,
    errors: [
      StatusCodes.BAD_REQUEST,
      StatusCodes.UNAUTHORIZED,
      StatusCodes.FORBIDDEN,
    ],
  },
];
