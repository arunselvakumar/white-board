import { StatusCodes } from "http-status-codes";

import type {
  OpenApiComponents,
  OpenApiOperation,
} from "@/app/api/_lib/openapi";

import {
  CENTRAL_PAYMENT_PATH,
  GetConstructionFinanceCentralPaymentResponseModel,
} from "./central-payment-models";

export const centralPaymentOpenApiComponents: OpenApiComponents = {
  GetConstructionFinanceCentralPaymentResponseModel,
};

export const centralPaymentOpenApiOperations: OpenApiOperation[] = [
  {
    method: "get",
    path: CENTRAL_PAYMENT_PATH,
    summary:
      "Central Payment: party dues across Projects, account balances and petty cash (CM-709)",
    tags: ["Construction · Finance"],
    successStatus: StatusCodes.OK,
    successDescription: "The Workspace's Central Payment summary",
    successSchema: GetConstructionFinanceCentralPaymentResponseModel,
    errors: [StatusCodes.UNAUTHORIZED, StatusCodes.FORBIDDEN],
  },
];
