import { StatusCodes } from "http-status-codes";

import type { PreschoolOpenApi } from "../_lib/openapi";
import {
  ListPreschoolProgrammesRequestModel,
  PreschoolProgrammeDetailsRequestModel,
  PreschoolProgrammeListResponseModel,
  PreschoolProgrammeModel,
  PreschoolProgrammeParamsModel,
  ReorderPreschoolProgrammesRequestModel,
} from "./programme-models";

const tags = ["Preschool"];
const AUTH = [StatusCodes.UNAUTHORIZED, StatusCodes.FORBIDDEN];
const BY_ID = [...AUTH, StatusCodes.BAD_REQUEST, StatusCodes.NOT_FOUND];

export const programmesOpenApi: PreschoolOpenApi = {
  operations: [
    {
      method: "get",
      path: "/api/preschool/programmes",
      summary: "List Programmes in display order",
      tags,
      query: ListPreschoolProgrammesRequestModel,
      successStatus: StatusCodes.OK,
      successDescription: "Programmes; archived ones only when asked for",
      successSchema: PreschoolProgrammeListResponseModel,
      errors: [...AUTH, StatusCodes.BAD_REQUEST],
    },
    {
      method: "post",
      path: "/api/preschool/programmes",
      summary: "Add a Programme (Owner)",
      tags,
      body: PreschoolProgrammeDetailsRequestModel,
      successStatus: StatusCodes.CREATED,
      successDescription: "The new Programme, last in the order",
      successSchema: PreschoolProgrammeModel,
      errors: [...AUTH, StatusCodes.BAD_REQUEST, StatusCodes.CONFLICT],
    },
    {
      method: "post",
      path: "/api/preschool/programmes/{id}/details",
      summary: "Change a Programme's name, age range and daycare flag (Owner)",
      tags,
      params: PreschoolProgrammeParamsModel,
      body: PreschoolProgrammeDetailsRequestModel,
      successStatus: StatusCodes.OK,
      successDescription: "The Programme",
      successSchema: PreschoolProgrammeModel,
      errors: [...BY_ID, StatusCodes.CONFLICT],
    },
    {
      method: "post",
      path: "/api/preschool/programmes/{id}/archive",
      summary: "Archive a Programme with no Classrooms this year (Owner)",
      tags,
      params: PreschoolProgrammeParamsModel,
      successStatus: StatusCodes.OK,
      successDescription: "The Programme, archived",
      successSchema: PreschoolProgrammeModel,
      errors: [...BY_ID, StatusCodes.CONFLICT],
    },
    {
      method: "post",
      path: "/api/preschool/programmes/{id}/restore",
      summary: "Restore an archived Programme (Owner)",
      tags,
      params: PreschoolProgrammeParamsModel,
      successStatus: StatusCodes.OK,
      successDescription: "The Programme",
      successSchema: PreschoolProgrammeModel,
      errors: [...BY_ID, StatusCodes.CONFLICT],
    },
    {
      method: "post",
      path: "/api/preschool/programmes/reorder",
      summary: "Put the Programmes in a new order (Owner)",
      tags,
      body: ReorderPreschoolProgrammesRequestModel,
      successStatus: StatusCodes.OK,
      successDescription: "Programmes that are not archived, in the new order",
      successSchema: PreschoolProgrammeListResponseModel,
      errors: [...AUTH, StatusCodes.BAD_REQUEST],
    },
  ],
  components: {
    PreschoolProgrammeModel,
    PreschoolProgrammeListResponseModel,
    PreschoolProgrammeDetailsRequestModel,
    ReorderPreschoolProgrammesRequestModel,
  },
};
