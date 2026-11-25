import { StatusCodes } from "http-status-codes";

import type { OpenApiOperation } from "@/app/api/_lib/openapi";

import type { PreschoolOpenApi } from "../_lib/openapi";
import {
  MarkPreschoolAttendanceRequestModel,
  PreschoolAttendanceChildDayRequestModel,
  PreschoolAttendanceChildParamsModel,
  PreschoolAttendanceDayRequestModel,
  PreschoolAttendanceMonthRequestModel,
  PreschoolAttendanceSummaryRequestModel,
  PreschoolCentreAttendanceSummaryModel,
  PreschoolCheckInRequestModel,
  PreschoolCheckOutRequestModel,
  PreschoolChildAttendanceDayModel,
  PreschoolChildAttendanceMonthModel,
  PreschoolChildAttendanceMonthRequestModel,
  PreschoolClassroomAttendanceModel,
  PreschoolClassroomAttendanceMonthModel,
} from "./attendance-models";

const PATH = "/api/preschool/attendance";
const tags = ["Preschool"];
const READ_ERRORS = [
  StatusCodes.BAD_REQUEST,
  StatusCodes.UNAUTHORIZED,
  StatusCodes.FORBIDDEN,
  StatusCodes.NOT_FOUND,
];
const WRITE_ERRORS = [...READ_ERRORS, StatusCodes.CONFLICT];

function childCommand(
  path: string,
  summary: string,
  body: OpenApiOperation["body"],
): OpenApiOperation {
  return {
    method: "post",
    path: `${PATH}/${path}`,
    summary,
    tags,
    body,
    successStatus: StatusCodes.OK,
    successDescription: "The Child's mark for the day",
    successSchema: PreschoolChildAttendanceDayModel,
    errors: WRITE_ERRORS,
  };
}

export const attendanceOpenApi: PreschoolOpenApi = {
  operations: [
    {
      method: "get",
      path: PATH,
      summary: "A Classroom's register for one day (staff of the Classroom)",
      tags,
      query: PreschoolAttendanceDayRequestModel,
      successStatus: StatusCodes.OK,
      successDescription: "The roster with each Child's mark and the counts",
      successSchema: PreschoolClassroomAttendanceModel,
      errors: READ_ERRORS,
    },
    {
      method: "post",
      path: `${PATH}/mark`,
      summary: "Set many Children's status for the day",
      tags,
      body: MarkPreschoolAttendanceRequestModel,
      successStatus: StatusCodes.OK,
      successDescription: "The Classroom's register after the change",
      successSchema: PreschoolClassroomAttendanceModel,
      errors: WRITE_ERRORS,
    },
    childCommand("check-in", "Check a Child in", PreschoolCheckInRequestModel),
    childCommand(
      "check-out",
      "Check a Child out with who collected them",
      PreschoolCheckOutRequestModel,
    ),
    childCommand(
      "undo-check-out",
      "Take back a check-out",
      PreschoolAttendanceChildDayRequestModel,
    ),
    childCommand(
      "clear",
      "Remove a Child's mark for the day",
      PreschoolAttendanceChildDayRequestModel,
    ),
    {
      method: "get",
      path: `${PATH}/month`,
      summary: "A Classroom's monthly register",
      tags,
      query: PreschoolAttendanceMonthRequestModel,
      successStatus: StatusCodes.OK,
      successDescription:
        "Each Child's status per day, totals and working days",
      successSchema: PreschoolClassroomAttendanceMonthModel,
      errors: READ_ERRORS,
    },
    {
      method: "get",
      path: `${PATH}/summary`,
      summary: "A Centre's day per Classroom (Owner and Centre Head)",
      tags,
      query: PreschoolAttendanceSummaryRequestModel,
      successStatus: StatusCodes.OK,
      successDescription: "Counts per Classroom and for the Centre",
      successSchema: PreschoolCentreAttendanceSummaryModel,
      errors: READ_ERRORS,
    },
    {
      method: "get",
      path: `${PATH}/children/{childId}`,
      summary: "A Child's month (staff of the Child, and the Child's Parents)",
      tags,
      params: PreschoolAttendanceChildParamsModel,
      query: PreschoolChildAttendanceMonthRequestModel,
      successStatus: StatusCodes.OK,
      successDescription:
        "Each day's status, times and who collected the Child",
      successSchema: PreschoolChildAttendanceMonthModel,
      errors: READ_ERRORS,
    },
  ],
  components: {
    PreschoolClassroomAttendanceModel,
    PreschoolChildAttendanceDayModel,
    PreschoolClassroomAttendanceMonthModel,
    PreschoolCentreAttendanceSummaryModel,
    PreschoolChildAttendanceMonthModel,
    MarkPreschoolAttendanceRequestModel,
    PreschoolCheckInRequestModel,
    PreschoolCheckOutRequestModel,
    PreschoolAttendanceChildDayRequestModel,
  },
};
