import { StatusCodes } from "http-status-codes";

import type { OpenApiOperation } from "@/app/api/_lib/openapi";

import type { PreschoolOpenApi } from "../_lib/openapi";
import {
  AdmitPreschoolChildRequestModel,
  AdmitPreschoolChildResponseModel,
  ListPreschoolChildrenRequestModel,
  ListPreschoolChildrenResponseModel,
  MovePreschoolChildClassroomRequestModel,
  PreschoolAuthorisedPickupInputModel,
  PreschoolChildDetailsModel,
  PreschoolChildListItemModel,
  PreschoolChildOptionsRequestModel,
  PreschoolChildOptionsResponseModel,
  PreschoolChildParamsModel,
  PreschoolChildProfileModel,
  PreschoolParentInputModel,
  PromotePreschoolChildRequestModel,
  ReplacePreschoolChildPickupsRequestModel,
  UpdatePreschoolChildHealthRequestModel,
  UpdatePreschoolChildParentsRequestModel,
  UpdatePreschoolChildProfileRequestModel,
  WithdrawPreschoolChildRequestModel,
} from "./child-models";

const PATH = "/api/preschool/children";
const tags = ["Preschool"];
const READ_ERRORS = [
  StatusCodes.BAD_REQUEST,
  StatusCodes.UNAUTHORIZED,
  StatusCodes.FORBIDDEN,
];
const WRITE_ERRORS = [
  StatusCodes.BAD_REQUEST,
  StatusCodes.UNAUTHORIZED,
  StatusCodes.FORBIDDEN,
  StatusCodes.NOT_FOUND,
  StatusCodes.CONFLICT,
];

function command(
  path: string,
  summary: string,
  body: OpenApiOperation["body"],
  successSchema: OpenApiOperation["successSchema"] = PreschoolChildProfileModel,
): OpenApiOperation {
  return {
    method: "post",
    path: `${PATH}/{id}/${path}`,
    summary,
    tags,
    params: PreschoolChildParamsModel,
    body,
    successStatus: StatusCodes.OK,
    successDescription: "The Child's profile",
    successSchema,
    errors: WRITE_ERRORS,
  };
}

export const childrenOpenApi: PreschoolOpenApi = {
  operations: [
    {
      method: "get",
      path: PATH,
      summary:
        "A Centre's Children by first name (a Teacher: their Classrooms only)",
      tags,
      query: ListPreschoolChildrenRequestModel,
      successStatus: StatusCodes.OK,
      successDescription: "A page of Children and the total",
      successSchema: ListPreschoolChildrenResponseModel,
      errors: READ_ERRORS,
    },
    {
      method: "post",
      path: PATH,
      summary: "Admit a Child (Owner and Centre Head)",
      tags,
      body: AdmitPreschoolChildRequestModel,
      successStatus: StatusCodes.CREATED,
      successDescription:
        "The new Child and a warning when their age is outside the Programme's range",
      successSchema: AdmitPreschoolChildResponseModel,
      errors: WRITE_ERRORS,
    },
    {
      method: "get",
      path: `${PATH}/options`,
      summary: "What the admission, move and promote forms choose from",
      tags,
      query: PreschoolChildOptionsRequestModel,
      successStatus: StatusCodes.OK,
      successDescription:
        "Academic Years, Programmes and Classrooms with seats left",
      successSchema: PreschoolChildOptionsResponseModel,
      errors: READ_ERRORS,
    },
    {
      method: "get",
      path: `${PATH}/{id}`,
      summary: "A Child's profile with Admissions, Pickups and siblings",
      tags,
      params: PreschoolChildParamsModel,
      successStatus: StatusCodes.OK,
      successDescription: "The Child's profile",
      successSchema: PreschoolChildProfileModel,
      errors: [...READ_ERRORS, StatusCodes.NOT_FOUND],
    },
    command(
      "profile",
      "Edit a Child's details and address",
      UpdatePreschoolChildProfileRequestModel,
    ),
    command(
      "parents",
      "Edit father, mother and emergency contact",
      UpdatePreschoolChildParentsRequestModel,
    ),
    command(
      "health",
      "Edit health and the documents checklist",
      UpdatePreschoolChildHealthRequestModel,
    ),
    command(
      "pickups",
      "Replace the Authorised Pickups",
      ReplacePreschoolChildPickupsRequestModel,
    ),
    command(
      "move-classroom",
      "Move a Child to another Classroom of the same Programme and year",
      MovePreschoolChildClassroomRequestModel,
    ),
    command(
      "promote",
      "Promote a Child into a later Academic Year",
      PromotePreschoolChildRequestModel,
      AdmitPreschoolChildResponseModel,
    ),
    command("withdraw", "Withdraw a Child", WithdrawPreschoolChildRequestModel),
  ],
  components: {
    PreschoolChildDetailsModel,
    PreschoolParentInputModel,
    PreschoolAuthorisedPickupInputModel,
    PreschoolChildListItemModel,
    PreschoolChildProfileModel,
    AdmitPreschoolChildRequestModel,
    AdmitPreschoolChildResponseModel,
    ListPreschoolChildrenResponseModel,
    PreschoolChildOptionsResponseModel,
    UpdatePreschoolChildProfileRequestModel,
    UpdatePreschoolChildParentsRequestModel,
    UpdatePreschoolChildHealthRequestModel,
    ReplacePreschoolChildPickupsRequestModel,
    MovePreschoolChildClassroomRequestModel,
    PromotePreschoolChildRequestModel,
    WithdrawPreschoolChildRequestModel,
  },
};
