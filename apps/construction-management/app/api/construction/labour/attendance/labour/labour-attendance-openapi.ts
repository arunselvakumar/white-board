import { StatusCodes } from "http-status-codes";

import type {
  OpenApiComponents,
  OpenApiOperation,
} from "@/app/api/_lib/openapi";

import {
  ClearConstructionLabourEmployeeAttendanceRequestModel,
  ConstructionLabourEmployeeAttendanceDayResponseModel,
  ConstructionLabourEmployeeAttendanceOvertimeResponseModel,
  ConstructionLabourEmployeeAttendanceParamsModel,
  GetConstructionLabourEmployeeAttendanceMonthRequestModel,
  GetConstructionLabourEmployeeAttendanceMonthResponseModel,
  GetConstructionLabourEmployeeAttendanceSheetRequestModel,
  GetConstructionLabourEmployeeAttendanceSheetResponseModel,
  LABOUR_ATTENDANCE_PATH,
  ListConstructionLabourEmployeeAttendanceRequestModel,
  ListConstructionLabourEmployeeAttendanceResponseModel,
  MarkConstructionLabourEmployeeAttendanceRequestModel,
  MarkConstructionLabourEmployeeAttendanceResponseModel,
  SetConstructionLabourEmployeeAttendancePaidLeaveRequestModel,
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

/** Labour attendance models. */
export const labourAttendanceOpenApiComponents: OpenApiComponents = {
  ConstructionLabourEmployeeAttendanceOvertimeResponseModel,
  ConstructionLabourEmployeeAttendanceDayResponseModel,
  GetConstructionLabourEmployeeAttendanceSheetResponseModel,
  MarkConstructionLabourEmployeeAttendanceRequestModel,
  MarkConstructionLabourEmployeeAttendanceResponseModel,
  ClearConstructionLabourEmployeeAttendanceRequestModel,
  SetConstructionLabourEmployeeAttendancePaidLeaveRequestModel,
  ListConstructionLabourEmployeeAttendanceResponseModel,
  GetConstructionLabourEmployeeAttendanceMonthResponseModel,
};

/** Labour attendance routes. Menu `labour.attendance` on the Project. */
export const labourAttendanceOpenApiOperations: OpenApiOperation[] = [
  {
    method: "get",
    path: BASE,
    summary:
      "Marked labour days of a Project, newest date first, by dates, Employee and status (amounts null without Labour Financial)",
    tags: LABOUR,
    query: ListConstructionLabourEmployeeAttendanceRequestModel,
    successStatus: StatusCodes.OK,
    successDescription: "A page of labour days",
    successSchema: ListConstructionLabourEmployeeAttendanceResponseModel,
    errors: READ_ERRORS,
  },
  {
    method: "get",
    path: `${BASE}/sheet`,
    summary:
      "The labour marking sheet for a Project and date: every active Employee on the Project that day, their row and a pre-fill hint",
    tags: LABOUR,
    query: GetConstructionLabourEmployeeAttendanceSheetRequestModel,
    successStatus: StatusCodes.OK,
    successDescription: "The marking sheet",
    successSchema: GetConstructionLabourEmployeeAttendanceSheetResponseModel,
    errors: READ_ERRORS,
  },
  {
    method: "post",
    path: `${BASE}/mark`,
    summary:
      "Mark many Employees' day in one transaction, priced and posted to the labour ledger (EMPLOYEE_INACTIVE, EMPLOYEE_NOT_ON_PROJECT, OVERTIME_ON_ABSENT_DAY, TIMES_NEED_PRESENT, CHECK_IN_REQUIRED, BREAK_TOO_LONG 400; overtime `fromTimes` hours worked out from check-in, check-out and break; ATTENDANCE_CHANGED 409 with details.employeeId; back-dated 403)",
    tags: LABOUR,
    body: MarkConstructionLabourEmployeeAttendanceRequestModel,
    successStatus: StatusCodes.OK,
    successDescription: "The saved rows",
    successSchema: MarkConstructionLabourEmployeeAttendanceResponseModel,
    errors: WRITE_ERRORS,
  },
  {
    method: "post",
    path: `${BASE}/clear`,
    summary:
      "Clear Labours' marked day: tombstones and ledger reversals, all or none (needs Attendance delete; back-dated edit limit)",
    tags: LABOUR,
    body: ClearConstructionLabourEmployeeAttendanceRequestModel,
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
    params: ConstructionLabourEmployeeAttendanceParamsModel,
    body: SetConstructionLabourEmployeeAttendancePaidLeaveRequestModel,
    successStatus: StatusCodes.OK,
    successDescription: "The changed day",
    successSchema: ConstructionLabourEmployeeAttendanceDayResponseModel,
    errors: WRITE_ERRORS,
  },
  {
    method: "get",
    path: `${BASE}/month`,
    summary:
      "Month grid: Employee × day codes (P/H/A/L/PL/HO) with overtime hours and totals per Employee",
    tags: LABOUR,
    query: GetConstructionLabourEmployeeAttendanceMonthRequestModel,
    successStatus: StatusCodes.OK,
    successDescription: "The month grid",
    successSchema: GetConstructionLabourEmployeeAttendanceMonthResponseModel,
    errors: READ_ERRORS,
  },
];
