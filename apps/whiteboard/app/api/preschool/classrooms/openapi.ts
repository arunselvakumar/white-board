import { StatusCodes } from "http-status-codes";

import type { PreschoolOpenApi } from "../_lib/openapi";
import {
  CreatePreschoolClassroomRequestModel,
  ListPreschoolClassroomsRequestModel,
  PreschoolClassroomDetailResponseModel,
  PreschoolClassroomListResponseModel,
  PreschoolClassroomModel,
  PreschoolClassroomOptionsRequestModel,
  PreschoolClassroomOptionsResponseModel,
  PreschoolClassroomParamsModel,
  SetPreschoolClassTeachersRequestModel,
  UpdatePreschoolClassroomDetailsRequestModel,
} from "./classroom-models";

const tags = ["Preschool"];
const AUTH = [StatusCodes.UNAUTHORIZED, StatusCodes.FORBIDDEN];
const BY_ID = [...AUTH, StatusCodes.BAD_REQUEST, StatusCodes.NOT_FOUND];

export const classroomsOpenApi: PreschoolOpenApi = {
  operations: [
    {
      method: "get",
      path: "/api/preschool/classrooms",
      summary: "List a Centre's Classrooms for an Academic Year",
      tags,
      query: ListPreschoolClassroomsRequestModel,
      successStatus: StatusCodes.OK,
      successDescription:
        "Classrooms with seats left and Class Teachers; a Teacher sees only their own",
      successSchema: PreschoolClassroomListResponseModel,
      errors: [...AUTH, StatusCodes.BAD_REQUEST, StatusCodes.NOT_FOUND],
    },
    {
      method: "post",
      path: "/api/preschool/classrooms",
      summary: "Add a Classroom to a Centre (Owner or Centre Head)",
      tags,
      body: CreatePreschoolClassroomRequestModel,
      successStatus: StatusCodes.CREATED,
      successDescription: "The new Classroom",
      successSchema: PreschoolClassroomModel,
      errors: [
        ...AUTH,
        StatusCodes.BAD_REQUEST,
        StatusCodes.NOT_FOUND,
        StatusCodes.CONFLICT,
      ],
    },
    {
      method: "get",
      path: "/api/preschool/classrooms/options",
      summary: "Programmes and this year's Classrooms for forms",
      tags,
      query: PreschoolClassroomOptionsRequestModel,
      successStatus: StatusCodes.OK,
      successDescription:
        "Programmes that are not archived and the Centre's Classrooms with seats left",
      successSchema: PreschoolClassroomOptionsResponseModel,
      errors: [...AUTH, StatusCodes.BAD_REQUEST],
    },
    {
      method: "get",
      path: "/api/preschool/classrooms/{id}",
      summary: "A Classroom with its roster",
      tags,
      params: PreschoolClassroomParamsModel,
      successStatus: StatusCodes.OK,
      successDescription: "The Classroom and the Children admitted to it",
      successSchema: PreschoolClassroomDetailResponseModel,
      errors: BY_ID,
    },
    {
      method: "post",
      path: "/api/preschool/classrooms/{id}/details",
      summary: "Rename a Classroom or change its capacity",
      tags,
      params: PreschoolClassroomParamsModel,
      body: UpdatePreschoolClassroomDetailsRequestModel,
      successStatus: StatusCodes.OK,
      successDescription: "The Classroom",
      successSchema: PreschoolClassroomModel,
      errors: [...BY_ID, StatusCodes.CONFLICT],
    },
    {
      method: "post",
      path: "/api/preschool/classrooms/{id}/archive",
      summary: "Archive a Classroom with no Children",
      tags,
      params: PreschoolClassroomParamsModel,
      successStatus: StatusCodes.OK,
      successDescription: "The Classroom, archived",
      successSchema: PreschoolClassroomModel,
      errors: [...BY_ID, StatusCodes.CONFLICT],
    },
    {
      method: "post",
      path: "/api/preschool/classrooms/{id}/teachers",
      summary: "Set a Classroom's Class Teachers",
      tags,
      params: PreschoolClassroomParamsModel,
      body: SetPreschoolClassTeachersRequestModel,
      successStatus: StatusCodes.OK,
      successDescription: "The Classroom with its Class Teachers",
      successSchema: PreschoolClassroomModel,
      errors: [...BY_ID, StatusCodes.CONFLICT],
    },
  ],
  components: {
    PreschoolClassroomModel,
    PreschoolClassroomListResponseModel,
    PreschoolClassroomDetailResponseModel,
    PreschoolClassroomOptionsResponseModel,
    CreatePreschoolClassroomRequestModel,
    UpdatePreschoolClassroomDetailsRequestModel,
    SetPreschoolClassTeachersRequestModel,
  },
};
