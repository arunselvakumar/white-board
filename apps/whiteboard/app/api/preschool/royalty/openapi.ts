import { StatusCodes } from "http-status-codes";

import { PreschoolMonthRequestModel } from "../dashboard/dashboard-models";
import type { PreschoolOpenApi } from "../_lib/openapi";
import {
  PreschoolCentreRoyaltyStatementResponseModel,
  PreschoolRoyaltyParamsModel,
  PreschoolRoyaltyStatementResponseModel,
} from "./royalty-models";

export const royaltyOpenApi: PreschoolOpenApi = {
  operations: [
    {
      method: "get",
      path: "/api/preschool/royalty",
      summary:
        "The month's Royalty Statement for every Franchised Centre (Owner)",
      tags: ["Preschool"],
      query: PreschoolMonthRequestModel,
      successStatus: StatusCodes.OK,
      successDescription:
        "Collections by Fee Head and the royalty due, per Franchised Centre",
      successSchema: PreschoolRoyaltyStatementResponseModel,
      errors: [
        StatusCodes.BAD_REQUEST,
        StatusCodes.UNAUTHORIZED,
        StatusCodes.FORBIDDEN,
      ],
    },
    {
      method: "get",
      path: "/api/preschool/royalty/{centreId}",
      summary:
        "One Franchised Centre's Royalty Statement with its Fee Payments (Owner)",
      tags: ["Preschool"],
      params: PreschoolRoyaltyParamsModel,
      query: PreschoolMonthRequestModel,
      successStatus: StatusCodes.OK,
      successDescription: "The statement and the Receipts behind it",
      successSchema: PreschoolCentreRoyaltyStatementResponseModel,
      errors: [
        StatusCodes.BAD_REQUEST,
        StatusCodes.UNAUTHORIZED,
        StatusCodes.FORBIDDEN,
        StatusCodes.NOT_FOUND,
        StatusCodes.CONFLICT,
      ],
    },
  ],
  components: {
    PreschoolRoyaltyStatementResponseModel,
    PreschoolCentreRoyaltyStatementResponseModel,
  },
};
