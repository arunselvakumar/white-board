import { StatusCodes } from "http-status-codes";

import type {
  OpenApiComponents,
  OpenApiOperation,
} from "@/app/api/_lib/openapi";

import {
  GetConstructionTrackingAccessRequestModel,
  GetConstructionTrackingAccessResponseModel,
} from "./access-models";

export const trackingAccessOpenApiComponents: OpenApiComponents = {
  GetConstructionTrackingAccessResponseModel,
};

export const trackingAccessOpenApiOperations: OpenApiOperation[] = [
  {
    method: "get",
    path: "/api/construction/tracking/access",
    summary: "The tracking flags the caller holds on a Project (M8)",
    tags: ["Construction · Tracking"],
    query: GetConstructionTrackingAccessRequestModel,
    successStatus: StatusCodes.OK,
    successDescription: "Flags per tracking menu",
    successSchema: GetConstructionTrackingAccessResponseModel,
    errors: [
      StatusCodes.BAD_REQUEST,
      StatusCodes.UNAUTHORIZED,
      StatusCodes.FORBIDDEN,
      StatusCodes.NOT_FOUND,
    ],
  },
];
