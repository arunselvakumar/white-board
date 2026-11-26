import { StatusCodes } from "http-status-codes";

import type { OpenApiOperation } from "@/app/api/_lib/openapi";

import type { PreschoolOpenApi } from "../_lib/openapi";
import {
  CreatePreschoolCentreRequestModel,
  ListPreschoolCentresResponseModel,
  PreschoolCentreParamsModel,
  PreschoolCentreResponseModel,
  UpdatePreschoolCentreDetailsRequestModel,
  UpdatePreschoolCentreFranchiseRequestModel,
} from "./centres-models";

const tags = ["Preschool"];

function centreOperation(
  path: string,
  summary: string,
  extra: Partial<OpenApiOperation> & { errors: StatusCodes[] },
): OpenApiOperation {
  return {
    method: "post",
    path: `/api/preschool/centres/{id}${path}`,
    summary,
    tags,
    params: PreschoolCentreParamsModel,
    successStatus: StatusCodes.OK,
    successDescription: "The Centre",
    successSchema: PreschoolCentreResponseModel,
    ...extra,
  };
}

export const centresOpenApi: PreschoolOpenApi = {
  operations: [
    {
      method: "get",
      path: "/api/preschool/centres",
      summary: "Centres the User may open (Owner, Centre Head)",
      tags,
      successStatus: StatusCodes.OK,
      successDescription:
        "Centres by name, with active Children and Classrooms",
      successSchema: ListPreschoolCentresResponseModel,
      errors: [StatusCodes.UNAUTHORIZED, StatusCodes.FORBIDDEN],
    },
    {
      method: "post",
      path: "/api/preschool/centres",
      summary: "Add a Centre (Owner)",
      tags,
      body: CreatePreschoolCentreRequestModel,
      successStatus: StatusCodes.CREATED,
      successDescription: "The new Centre",
      successSchema: PreschoolCentreResponseModel,
      errors: [
        StatusCodes.BAD_REQUEST,
        StatusCodes.UNAUTHORIZED,
        StatusCodes.FORBIDDEN,
        StatusCodes.CONFLICT,
      ],
    },
    centreOperation("", "One Centre (Owner, or its Centre Head)", {
      method: "get",
      errors: [
        StatusCodes.BAD_REQUEST,
        StatusCodes.UNAUTHORIZED,
        StatusCodes.FORBIDDEN,
        StatusCodes.NOT_FOUND,
      ],
    }),
    centreOperation(
      "/details",
      "Change a Centre's name, code and contact details (Owner)",
      {
        body: UpdatePreschoolCentreDetailsRequestModel,
        errors: [
          StatusCodes.BAD_REQUEST,
          StatusCodes.UNAUTHORIZED,
          StatusCodes.FORBIDDEN,
          StatusCodes.NOT_FOUND,
          StatusCodes.CONFLICT,
        ],
      },
    ),
    centreOperation(
      "/franchise",
      "Change a Centre's ownership, franchisee and royalty (Owner)",
      {
        body: UpdatePreschoolCentreFranchiseRequestModel,
        errors: [
          StatusCodes.BAD_REQUEST,
          StatusCodes.UNAUTHORIZED,
          StatusCodes.FORBIDDEN,
          StatusCodes.NOT_FOUND,
        ],
      },
    ),
    centreOperation(
      "/close",
      "Close a Centre with no active Children (Owner)",
      {
        errors: [
          StatusCodes.BAD_REQUEST,
          StatusCodes.UNAUTHORIZED,
          StatusCodes.FORBIDDEN,
          StatusCodes.NOT_FOUND,
          StatusCodes.CONFLICT,
        ],
      },
    ),
    centreOperation("/reopen", "Reopen a closed Centre (Owner)", {
      errors: [
        StatusCodes.BAD_REQUEST,
        StatusCodes.UNAUTHORIZED,
        StatusCodes.FORBIDDEN,
        StatusCodes.NOT_FOUND,
        StatusCodes.CONFLICT,
      ],
    }),
  ],
  components: {
    CreatePreschoolCentreRequestModel,
    UpdatePreschoolCentreDetailsRequestModel,
    UpdatePreschoolCentreFranchiseRequestModel,
    PreschoolCentreResponseModel,
    ListPreschoolCentresResponseModel,
  },
};
