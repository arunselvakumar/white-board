import { StatusCodes } from "http-status-codes";

import type { PreschoolOpenApi } from "../_lib/openapi";
import {
  PreschoolCentreDashboardResponseModel,
  PreschoolDashboardRequestModel,
  PreschoolHeadOfficeResponseModel,
  PreschoolMonthRequestModel,
} from "./dashboard-models";

export const dashboardOpenApi: PreschoolOpenApi = {
  operations: [
    {
      method: "get",
      path: "/api/preschool/dashboard",
      summary: "The Centre Dashboard for today (Owner, Centre Head)",
      tags: ["Preschool"],
      query: PreschoolDashboardRequestModel,
      successStatus: StatusCodes.OK,
      successDescription:
        "Children, attendance, Daily Reports, fees, Enquiries, stock and what is coming up",
      successSchema: PreschoolCentreDashboardResponseModel,
      errors: [
        StatusCodes.BAD_REQUEST,
        StatusCodes.UNAUTHORIZED,
        StatusCodes.FORBIDDEN,
      ],
    },
    {
      method: "get",
      path: "/api/preschool/dashboard/head-office",
      summary: "Every Centre side by side for a month (Owner)",
      tags: ["Preschool"],
      query: PreschoolMonthRequestModel,
      successStatus: StatusCodes.OK,
      successDescription: "One row per Centre, and totals",
      successSchema: PreschoolHeadOfficeResponseModel,
      errors: [
        StatusCodes.BAD_REQUEST,
        StatusCodes.UNAUTHORIZED,
        StatusCodes.FORBIDDEN,
      ],
    },
  ],
  components: {
    PreschoolCentreDashboardResponseModel,
    PreschoolHeadOfficeResponseModel,
  },
};
