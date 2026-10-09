import { StatusCodes } from "http-status-codes";

import type {
  OpenApiComponents,
  OpenApiOperation,
} from "@/app/api/_lib/openapi";

import {
  ClearConstructionLabourLabourAttendanceRequestModel,
  ConstructionLabourLabourAttendanceDayResponseModel,
  ConstructionLabourLabourAttendanceOvertimeResponseModel,
  ConstructionLabourLabourAttendanceParamsModel,
  GetConstructionLabourLabourAttendanceMonthRequestModel,
  GetConstructionLabourLabourAttendanceMonthResponseModel,
  GetConstructionLabourLabourAttendanceSheetRequestModel,
  GetConstructionLabourLabourAttendanceSheetResponseModel,
  LABOUR_ATTENDANCE_PATH,
  ListConstructionLabourLabourAttendanceRequestModel,
  ListConstructionLabourLabourAttendanceResponseModel,
  MarkConstructionLabourLabourAttendanceRequestModel,
  MarkConstructionLabourLabourAttendanceResponseModel,
  SetConstructionLabourLabourAttendancePaidLeaveRequestModel,
} from "./labour-attendance-models";

const LABOUR = ["Construction · Labour"];

const READ_ERRORS = [
  StatusCodes.BAD_REQUEST,
  StatusCodes.UNAUTHORIZED,
  StatusCodes.FORBIDDEN,
  StatusCodes.NOT_FOUND,
];

const WRITE_ERRORS = [
  ...READ_ERRORS,
  StatusCodes.CONFLICT,
  StatusCodes.PAYMENT_REQUIRED,
];

const BASE = LABOUR_ATTENDANCE_PATH;

/** Labour attendance models (CM-210, CM-211). */
export const labourAttendanceOpenApiComponents: OpenApiComponents = {
  ConstructionLabourLabourAttendanceOvertimeResponseModel,
  ConstructionLabourLabourAttendanceDayResponseModel,
  GetConstructionLabourLabourAttendanceSheetResponseModel,
  MarkConstructionLabourLabourAttendanceRequestModel,
  MarkConstructionLabourLabourAttendanceResponseModel,
  ClearConstructionLabourLabourAttendanceRequestModel,
  SetConstructionLabourLabourAttendancePaidLeaveRequestModel,
  ListConstructionLabourLabourAttendanceResponseModel,
  GetConstructionLabourLabourAttendanceMonthResponseModel,
};

/** Labour attendance routes (CM-210, CM-211). Menu `labour.attendance` on the Project. */
export const labourAttendanceOpenApiOperations: OpenApiOperation[] = [
  {
    method: "get",
    path: BASE,
    summary:
      "Marked labour days of a Project, newest date first, by dates, labourer, Supervisor and status (amounts null without Labour Financial)",
    tags: LABOUR,
    query: ListConstructionLabourLabourAttendanceRequestModel,
    successStatus: StatusCodes.OK,
    successDescription: "A page of labour days",
    successSchema: ListConstructionLabourLabourAttendanceResponseModel,
    errors: READ_ERRORS,
  },
  {
    method: "get",
    path: `${BASE}/sheet`,
    summary:
      "The labour marking sheet for a Project and date: labourers on the Project that day, their row and a pre-fill hint",
    tags: LABOUR,
    query: GetConstructionLabourLabourAttendanceSheetRequestModel,
    successStatus: StatusCodes.OK,
    successDescription: "The marking sheet",
    successSchema: GetConstructionLabourLabourAttendanceSheetResponseModel,
    errors: READ_ERRORS,
  },
  {
    method: "post",
    path: `${BASE}/mark`,
    summary:
      "Mark many labourers' day in one transaction, priced and posted to the labour ledger (LABOUR_INACTIVE, LABOUR_NOT_ON_PROJECT, OVERTIME_ON_ABSENT_DAY 400; ATTENDANCE_CHANGED 409 with details.labourId; back-dated 403)",
    tags: LABOUR,
    body: MarkConstructionLabourLabourAttendanceRequestModel,
    successStatus: StatusCodes.OK,
    successDescription: "The saved rows",
    successSchema: MarkConstructionLabourLabourAttendanceResponseModel,
    errors: WRITE_ERRORS,
  },
  {
    method: "post",
    path: `${BASE}/clear`,
    summary:
      "Clear labourers' marked day: tombstones and ledger reversals, all or none (needs Attendance delete; back-dated edit limit)",
    tags: LABOUR,
    body: ClearConstructionLabourLabourAttendanceRequestModel,
    successStatus: StatusCodes.NO_CONTENT,
    successDescription: "Cleared",
    errors: WRITE_ERRORS,
  },
  {
    method: "post",
    path: `${BASE}/{id}/paid-leave`,
    summary:
      "Mark Paid Leave: toggle Paid Leave on an On Leave day and repost its ledger entries (PAID_LEAVE_NEEDS_LEAVE 400)",
    tags: LABOUR,
    params: ConstructionLabourLabourAttendanceParamsModel,
    body: SetConstructionLabourLabourAttendancePaidLeaveRequestModel,
    successStatus: StatusCodes.OK,
    successDescription: "The changed day",
    successSchema: ConstructionLabourLabourAttendanceDayResponseModel,
    errors: WRITE_ERRORS,
  },
  {
    method: "get",
    path: `${BASE}/month`,
    summary:
      "Month grid: labourer × day codes (P/H/A/L/PL/HO) with overtime hours and totals per labourer",
    tags: LABOUR,
    query: GetConstructionLabourLabourAttendanceMonthRequestModel,
    successStatus: StatusCodes.OK,
    successDescription: "The month grid",
    successSchema: GetConstructionLabourLabourAttendanceMonthResponseModel,
    errors: READ_ERRORS,
  },
];
