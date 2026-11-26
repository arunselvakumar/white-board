import { StatusCodes } from "http-status-codes";

import type { PreschoolOpenApi } from "../_lib/openapi";
import {
  ApplyPreschoolDailyReportToClassroomRequestModel,
  PreschoolChildDailyReportsModel,
  PreschoolChildDailyReportsRequestModel,
  PreschoolClassroomDailyReportsModel,
  PreschoolDailyReportChildParamsModel,
  PreschoolDailyReportDayRequestModel,
  PreschoolDailyReportModel,
  PublishPreschoolDailyReportsRequestModel,
  PublishPreschoolDailyReportsResponseModel,
  SavePreschoolDailyReportRequestModel,
} from "./daily-report-models";

const PATH = "/api/preschool/daily-reports";
const tags = ["Preschool"];
const READ_ERRORS = [
  StatusCodes.BAD_REQUEST,
  StatusCodes.UNAUTHORIZED,
  StatusCodes.FORBIDDEN,
  StatusCodes.NOT_FOUND,
];
const WRITE_ERRORS = [...READ_ERRORS, StatusCodes.CONFLICT];

export const dailyReportsOpenApi: PreschoolOpenApi = {
  operations: [
    {
      method: "get",
      path: PATH,
      summary:
        "A Classroom's Daily Reports for one day (staff of the Classroom)",
      tags,
      query: PreschoolDailyReportDayRequestModel,
      successStatus: StatusCodes.OK,
      successDescription: "The roster with attendance, each report and counts",
      successSchema: PreschoolClassroomDailyReportsModel,
      errors: READ_ERRORS,
    },
    {
      method: "post",
      path: `${PATH}/save`,
      summary: "Create or replace a Child's Daily Report",
      tags,
      body: SavePreschoolDailyReportRequestModel,
      successStatus: StatusCodes.OK,
      successDescription: "The report; a published one stays published",
      successSchema: PreschoolDailyReportModel,
      errors: WRITE_ERRORS,
    },
    {
      method: "post",
      path: `${PATH}/apply-to-classroom`,
      summary:
        "Apply the Classroom's menu and activities to each Child's report",
      tags,
      body: ApplyPreschoolDailyReportToClassroomRequestModel,
      successStatus: StatusCodes.OK,
      successDescription: "The Classroom's reports after the change",
      successSchema: PreschoolClassroomDailyReportsModel,
      errors: WRITE_ERRORS,
    },
    {
      method: "post",
      path: `${PATH}/publish`,
      summary: "Publish the day's drafts and email the Parents",
      tags,
      body: PublishPreschoolDailyReportsRequestModel,
      successStatus: StatusCodes.OK,
      successDescription: "How many drafts were published",
      successSchema: PublishPreschoolDailyReportsResponseModel,
      errors: WRITE_ERRORS,
    },
    {
      method: "get",
      path: `${PATH}/children/{childId}`,
      summary:
        "A Child's Daily Reports, newest first (a Parent: published ones only)",
      tags,
      params: PreschoolDailyReportChildParamsModel,
      query: PreschoolChildDailyReportsRequestModel,
      successStatus: StatusCodes.OK,
      successDescription: "A page of reports",
      successSchema: PreschoolChildDailyReportsModel,
      errors: READ_ERRORS,
    },
  ],
  components: {
    PreschoolDailyReportModel,
    PreschoolClassroomDailyReportsModel,
    PreschoolChildDailyReportsModel,
    SavePreschoolDailyReportRequestModel,
    ApplyPreschoolDailyReportToClassroomRequestModel,
    PublishPreschoolDailyReportsRequestModel,
    PublishPreschoolDailyReportsResponseModel,
  },
};
