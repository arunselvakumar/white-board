import { StatusCodes } from "http-status-codes";

import type { PreschoolOpenApi } from "../_lib/openapi";
import {
  CreatePreschoolStaffRequestModel,
  ListPreschoolStaffRequestModel,
  PreschoolStaffDetailsRequestModel,
  PreschoolStaffInvitationResponseModel,
  PreschoolStaffListResponseModel,
  PreschoolStaffModel,
  PreschoolStaffParamsModel,
} from "./staff-models";

const tags = ["Preschool"];
const AUTH = [StatusCodes.UNAUTHORIZED, StatusCodes.FORBIDDEN];
const BY_ID = [...AUTH, StatusCodes.BAD_REQUEST, StatusCodes.NOT_FOUND];

export const staffOpenApi: PreschoolOpenApi = {
  operations: [
    {
      method: "get",
      path: "/api/preschool/staff",
      summary: "List a Centre's Staff (Owner or Centre Head)",
      tags,
      query: ListPreschoolStaffRequestModel,
      successStatus: StatusCodes.OK,
      successDescription:
        "Staff with role, status, Classrooms and when they were invited",
      successSchema: PreschoolStaffListResponseModel,
      errors: [...AUTH, StatusCodes.BAD_REQUEST],
    },
    {
      method: "post",
      path: "/api/preschool/staff",
      summary:
        "Add a Staff member; a Centre Head or Teacher with an email is invited",
      tags,
      body: CreatePreschoolStaffRequestModel,
      successStatus: StatusCodes.CREATED,
      successDescription:
        "The Staff member, and whether the invitation was sent",
      successSchema: PreschoolStaffInvitationResponseModel,
      errors: [
        ...AUTH,
        StatusCodes.BAD_REQUEST,
        StatusCodes.NOT_FOUND,
        StatusCodes.CONFLICT,
      ],
    },
    {
      method: "post",
      path: "/api/preschool/staff/{id}/details",
      summary: "Change a Staff member's details and role",
      tags,
      params: PreschoolStaffParamsModel,
      body: PreschoolStaffDetailsRequestModel,
      successStatus: StatusCodes.OK,
      successDescription: "The Staff member",
      successSchema: PreschoolStaffModel,
      errors: [...BY_ID, StatusCodes.CONFLICT],
    },
    {
      method: "post",
      path: "/api/preschool/staff/{id}/deactivate",
      summary: "Deactivate a Staff member and remove their Classrooms",
      tags,
      params: PreschoolStaffParamsModel,
      successStatus: StatusCodes.OK,
      successDescription: "The Staff member, inactive",
      successSchema: PreschoolStaffModel,
      errors: BY_ID,
    },
    {
      method: "post",
      path: "/api/preschool/staff/{id}/activate",
      summary: "Activate a Staff member",
      tags,
      params: PreschoolStaffParamsModel,
      successStatus: StatusCodes.OK,
      successDescription: "The Staff member, active",
      successSchema: PreschoolStaffModel,
      errors: BY_ID,
    },
    {
      method: "post",
      path: "/api/preschool/staff/{id}/invite",
      summary: "Invite a Centre Head or Teacher to sign in, again",
      tags,
      params: PreschoolStaffParamsModel,
      successStatus: StatusCodes.OK,
      successDescription:
        "The Staff member, and whether the invitation was sent",
      successSchema: PreschoolStaffInvitationResponseModel,
      errors: [...BY_ID, StatusCodes.CONFLICT],
    },
  ],
  components: {
    PreschoolStaffModel,
    PreschoolStaffListResponseModel,
    PreschoolStaffInvitationResponseModel,
    PreschoolStaffDetailsRequestModel,
    CreatePreschoolStaffRequestModel,
  },
};
