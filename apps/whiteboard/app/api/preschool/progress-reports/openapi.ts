import { StatusCodes } from "http-status-codes";

import type { PreschoolOpenApi } from "../_lib/openapi";
import {
  ListPreschoolProgressReportsRequestModel,
  PreschoolChildProgressReportsModel,
  PreschoolClassroomProgressReportsModel,
  PreschoolProgressReportChildParamsModel,
  PreschoolProgressReportModel,
  PreschoolProgressReportParamsModel,
  SavePreschoolProgressReportRequestModel,
} from "./progress-report-models";

const PATH = "/api/preschool/progress-reports";
const tags = ["Preschool"];
const ERRORS = [
  StatusCodes.BAD_REQUEST,
  StatusCodes.UNAUTHORIZED,
  StatusCodes.FORBIDDEN,
  StatusCodes.NOT_FOUND,
  StatusCodes.CONFLICT,
];

export const progressReportsOpenApi: PreschoolOpenApi = {
  operations: [
    {
      method: "get",
      path: PATH,
      summary: "A Classroom's roster with each Child's report for a term",
      tags,
      query: ListPreschoolProgressReportsRequestModel,
      successStatus: StatusCodes.OK,
      successDescription: "The roster and report statuses",
      successSchema: PreschoolClassroomProgressReportsModel,
      errors: ERRORS,
    },
    {
      method: "post",
      path: `${PATH}/save`,
      summary: "Create or correct a Child's report for a term",
      tags,
      body: SavePreschoolProgressReportRequestModel,
      successStatus: StatusCodes.OK,
      successDescription: "The report",
      successSchema: PreschoolProgressReportModel,
      errors: ERRORS,
    },
    {
      method: "get",
      path: `${PATH}/children/{childId}`,
      summary: "A Child's reports (Parents: published only)",
      tags,
      params: PreschoolProgressReportChildParamsModel,
      successStatus: StatusCodes.OK,
      successDescription: "Newest first",
      successSchema: PreschoolChildProgressReportsModel,
      errors: ERRORS,
    },
    {
      method: "get",
      path: `${PATH}/{id}`,
      summary: "A Progress Report for printing",
      tags,
      params: PreschoolProgressReportParamsModel,
      successStatus: StatusCodes.OK,
      successDescription: "The report; Observations for staff only",
      successSchema: PreschoolProgressReportModel,
      errors: ERRORS,
    },
    {
      method: "post",
      path: `${PATH}/{id}/publish`,
      summary: "Publish a report; every Domain must be rated",
      tags,
      params: PreschoolProgressReportParamsModel,
      successStatus: StatusCodes.OK,
      successDescription: "The published report",
      successSchema: PreschoolProgressReportModel,
      errors: ERRORS,
    },
    {
      method: "post",
      path: `${PATH}/{id}/unpublish`,
      summary: "Take a published report back to draft (managers)",
      tags,
      params: PreschoolProgressReportParamsModel,
      successStatus: StatusCodes.OK,
      successDescription: "The report as a draft",
      successSchema: PreschoolProgressReportModel,
      errors: ERRORS,
    },
  ],
  components: {
    PreschoolProgressReportModel,
    PreschoolClassroomProgressReportsModel,
    PreschoolChildProgressReportsModel,
    SavePreschoolProgressReportRequestModel,
  },
};
