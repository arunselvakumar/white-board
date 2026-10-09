import { StatusCodes } from "http-status-codes";

import type {
  OpenApiComponents,
  OpenApiOperation,
} from "@/app/api/_lib/openapi";

import {
  ClearConstructionLabourVendorAttendanceRequestModel,
  ConstructionLabourVendorAttendanceDayResponseModel,
  ConstructionLabourVendorAttendanceLineResponseModel,
  ConstructionLabourVendorAttendanceParamsModel,
  GetConstructionLabourVendorAttendanceDayRequestModel,
  GetConstructionLabourVendorAttendanceDayResponseModel,
  GetConstructionLabourVendorAttendanceMonthRequestModel,
  GetConstructionLabourVendorAttendanceMonthResponseModel,
  GetConstructionLabourVendorAttendanceOvertimeRequestModel,
  GetConstructionLabourVendorAttendanceOvertimeResponseModel,
  ListConstructionLabourVendorAttendanceRequestModel,
  ListConstructionLabourVendorAttendanceResponseModel,
  RecordConstructionLabourVendorAttendanceRequestModel,
  VENDOR_ATTENDANCE_PATH,
} from "./vendor-attendance-models";

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

const BASE = VENDOR_ATTENDANCE_PATH;

/** Vendor attendance models (CM-212, CM-213). */
export const vendorAttendanceOpenApiComponents: OpenApiComponents = {
  ConstructionLabourVendorAttendanceLineResponseModel,
  ConstructionLabourVendorAttendanceDayResponseModel,
  GetConstructionLabourVendorAttendanceDayResponseModel,
  ListConstructionLabourVendorAttendanceResponseModel,
  GetConstructionLabourVendorAttendanceMonthResponseModel,
  GetConstructionLabourVendorAttendanceOvertimeResponseModel,
  RecordConstructionLabourVendorAttendanceRequestModel,
  ClearConstructionLabourVendorAttendanceRequestModel,
};

/** Vendor attendance routes (CM-212, CM-213). Menu `labour.attendance` on the Project. */
export const vendorAttendanceOpenApiOperations: OpenApiOperation[] = [
  {
    method: "get",
    path: BASE,
    summary:
      "Recorded vendor days of a Project, newest first, by vendor, Labour Category and dates (amounts null without Vendor Financial)",
    tags: LABOUR,
    query: ListConstructionLabourVendorAttendanceRequestModel,
    successStatus: StatusCodes.OK,
    successDescription: "A page of vendor days",
    successSchema: ListConstructionLabourVendorAttendanceResponseModel,
    errors: READ_ERRORS,
  },
  {
    method: "get",
    path: `${BASE}/day`,
    summary:
      "The vendor attendance grid for a Project and date: active vendors with rate cards and the day's lines",
    tags: LABOUR,
    query: GetConstructionLabourVendorAttendanceDayRequestModel,
    successStatus: StatusCodes.OK,
    successDescription: "The day grid",
    successSchema: GetConstructionLabourVendorAttendanceDayResponseModel,
    errors: READ_ERRORS,
  },
  {
    method: "post",
    path: `${BASE}/record`,
    summary:
      "Record (201) or change (200, with expectedUpdatedAt) a vendor's day: priced from the rate card, posted to the vendor ledger (VENDOR_NOT_ON_PROJECT, CATEGORY_NOT_ON_SHIFT 400; VENDOR_ATTENDANCE_CHANGED 409; back-dated 403)",
    tags: LABOUR,
    body: RecordConstructionLabourVendorAttendanceRequestModel,
    successStatus: StatusCodes.CREATED,
    successDescription: "The recorded day",
    successSchema: ConstructionLabourVendorAttendanceDayResponseModel,
    errors: WRITE_ERRORS,
  },
  {
    method: "post",
    path: `${BASE}/{id}/clear`,
    summary:
      "Clear a recorded vendor day: tombstone and ledger reversal (needs Attendance delete; back-dated edit limit)",
    tags: LABOUR,
    params: ConstructionLabourVendorAttendanceParamsModel,
    body: ClearConstructionLabourVendorAttendanceRequestModel,
    successStatus: StatusCodes.NO_CONTENT,
    successDescription: "Cleared",
    errors: WRITE_ERRORS,
  },
  {
    method: "get",
    path: `${BASE}/month`,
    summary:
      "Month view: vendor × day full/half/overtime with pay, totals per vendor, Labour Category and day",
    tags: LABOUR,
    query: GetConstructionLabourVendorAttendanceMonthRequestModel,
    successStatus: StatusCodes.OK,
    successDescription: "The month matrix",
    successSchema: GetConstructionLabourVendorAttendanceMonthResponseModel,
    errors: READ_ERRORS,
  },
  {
    method: "get",
    path: `${BASE}/overtime`,
    summary: "Vendor attendance lines with overtime between two dates",
    tags: LABOUR,
    query: GetConstructionLabourVendorAttendanceOvertimeRequestModel,
    successStatus: StatusCodes.OK,
    successDescription: "Overtime lines and totals",
    successSchema: GetConstructionLabourVendorAttendanceOvertimeResponseModel,
    errors: READ_ERRORS,
  },
];
