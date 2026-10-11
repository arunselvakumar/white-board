import { StatusCodes } from "http-status-codes";

import type {
  OpenApiComponents,
  OpenApiOperation,
} from "@/app/api/_lib/openapi";

import {
  ConstructionFinanceNamedOptionModel,
  GetConstructionFinanceCounterpartyOptionsRequestModel,
  GetConstructionFinanceCounterpartyOptionsResponseModel,
  GetConstructionFinancePaymentCategoryOptionsResponseModel,
} from "./lookup-models";

export const financeLookupOpenApiComponents: OpenApiComponents = {
  ConstructionFinanceNamedOptionModel,
  GetConstructionFinancePaymentCategoryOptionsResponseModel,
  GetConstructionFinanceCounterpartyOptionsResponseModel,
};

export const financeLookupOpenApiOperations: OpenApiOperation[] = [
  {
    method: "get",
    path: "/api/construction/finance/payment-categories/options",
    summary: "Payment Categories for a money form's picker (M7)",
    tags: ["Construction · Finance"],
    successStatus: StatusCodes.OK,
    successDescription: "Live, enabled Payment Categories",
    successSchema: GetConstructionFinancePaymentCategoryOptionsResponseModel,
    errors: [StatusCodes.UNAUTHORIZED],
  },
  {
    method: "get",
    path: "/api/construction/finance/counterparties/options",
    summary: "Parties of a kind for Paid To / Received From (M7)",
    tags: ["Construction · Finance"],
    query: GetConstructionFinanceCounterpartyOptionsRequestModel,
    successStatus: StatusCodes.OK,
    successDescription: "Parties by name",
    successSchema: GetConstructionFinanceCounterpartyOptionsResponseModel,
    errors: [StatusCodes.BAD_REQUEST, StatusCodes.UNAUTHORIZED],
  },
];
