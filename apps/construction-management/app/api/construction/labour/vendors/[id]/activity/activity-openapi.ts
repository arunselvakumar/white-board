import { StatusCodes } from "http-status-codes";

import type {
  OpenApiComponents,
  OpenApiOperation,
} from "@/app/api/_lib/openapi";

import { VENDORS_PATH } from "../../vendor-models";
import { ConstructionLabourVendorParamsModel } from "../vendor-params-model";
import {
  ListConstructionLabourVendorActivityRequestModel,
  ListConstructionLabourVendorActivityResponseModel,
} from "./activity-models";

/** The Vendor Activity feed's models. */
export const vendorActivityOpenApiComponents: OpenApiComponents = {
  ListConstructionLabourVendorActivityResponseModel,
};

export const vendorActivityOpenApiOperations: OpenApiOperation[] = [
  {
    method: "get",
    path: `${VENDORS_PATH}/{id}/activity`,
    summary:
      "The Vendor's Activity: Projects added to and removed from, check-in entries (ADR CM-0044 §7; menu `masters.vendors`, read); 400 INVALID_CURSOR, 404 VENDOR_NOT_FOUND",
    tags: ["Construction · Labour"],
    params: ConstructionLabourVendorParamsModel,
    query: ListConstructionLabourVendorActivityRequestModel,
    successStatus: StatusCodes.OK,
    successDescription: "One page of the feed, 30 entries at most",
    successSchema: ListConstructionLabourVendorActivityResponseModel,
    errors: [
      StatusCodes.BAD_REQUEST,
      StatusCodes.UNAUTHORIZED,
      StatusCodes.FORBIDDEN,
      StatusCodes.NOT_FOUND,
    ],
  },
];
