import { StatusCodes } from "http-status-codes";

import type {
  OpenApiComponents,
  OpenApiOperation,
} from "@/app/api/_lib/openapi";

import {
  GetConstructionProcurementAccessRequestModel,
  GetConstructionProcurementAccessResponseModel,
} from "./access-models";

export const accessOpenApiComponents: OpenApiComponents = {
  GetConstructionProcurementAccessResponseModel,
};

export const accessOpenApiOperations: OpenApiOperation[] = [
  {
    method: "get",
    path: "/api/construction/procurement/access",
    summary:
      "The procurement flags the caller holds, on a Project when given (M5)",
    tags: ["Construction · Procurement"],
    query: GetConstructionProcurementAccessRequestModel,
    successStatus: StatusCodes.OK,
    successDescription: "Flags per procurement menu",
    successSchema: GetConstructionProcurementAccessResponseModel,
    errors: [
      StatusCodes.BAD_REQUEST,
      StatusCodes.UNAUTHORIZED,
      StatusCodes.FORBIDDEN,
    ],
  },
];
