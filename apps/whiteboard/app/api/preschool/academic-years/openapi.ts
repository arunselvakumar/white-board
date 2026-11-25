import { StatusCodes } from "http-status-codes";

import type { PreschoolOpenApi } from "../_lib/openapi";
import {
  PreschoolAcademicYearListResponseModel,
  PreschoolAcademicYearModel,
  PreschoolAcademicYearParamsModel,
} from "./academic-year-models";

const tags = ["Preschool"];
const READ_ERRORS = [StatusCodes.UNAUTHORIZED, StatusCodes.FORBIDDEN];

export const academicYearsOpenApi: PreschoolOpenApi = {
  operations: [
    {
      method: "get",
      path: "/api/preschool/academic-years",
      summary: "List Academic Years, newest first",
      tags,
      successStatus: StatusCodes.OK,
      successDescription: "Every Academic Year, with the current one marked",
      successSchema: PreschoolAcademicYearListResponseModel,
      errors: READ_ERRORS,
    },
    {
      method: "post",
      path: "/api/preschool/academic-years",
      summary: "Add the Academic Year after the latest one (Owner)",
      tags,
      successStatus: StatusCodes.CREATED,
      successDescription: "The new Academic Year; it is not current yet",
      successSchema: PreschoolAcademicYearModel,
      errors: [...READ_ERRORS, StatusCodes.CONFLICT],
    },
    {
      method: "post",
      path: "/api/preschool/academic-years/{id}/make-current",
      summary: "Make an Academic Year the current one (Owner)",
      tags,
      params: PreschoolAcademicYearParamsModel,
      successStatus: StatusCodes.OK,
      successDescription: "The Academic Year, now current",
      successSchema: PreschoolAcademicYearModel,
      errors: [...READ_ERRORS, StatusCodes.BAD_REQUEST, StatusCodes.NOT_FOUND],
    },
  ],
  components: {
    PreschoolAcademicYearModel,
    PreschoolAcademicYearListResponseModel,
  },
};
