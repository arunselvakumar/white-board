import { StatusCodes } from "http-status-codes";

import type {
  OpenApiComponents,
  OpenApiOperation,
} from "@/app/api/_lib/openapi";
import { XLSX_CONTENT_TYPE } from "@/src/hrms/infrastructure/attendance-workbook";

import {
  ATTENDANCE_PATH,
  AddConstructionHrmsManualAttendanceRequestModel,
  AddConstructionHrmsMissedCheckoutRequestModel,
  ApproveConstructionHrmsAttendanceRequestModel,
  CheckInConstructionHrmsAttendanceRequestModel,
  CheckOutConstructionHrmsAttendanceRequestModel,
  ConstructionHrmsAttendanceDayResponseModel,
  ConstructionHrmsAttendanceEntryResponseModel,
  ConstructionHrmsMonthRequestModel,
  GetConstructionHrmsAttendanceMonthlySummaryResponseModel,
  GetConstructionHrmsAttendanceTodayResponseModel,
  GetConstructionHrmsTeamTodayResponseModel,
  HrmsAttendanceIdParamsModel,
  ListConstructionHrmsAttendanceApprovalsResponseModel,
  ListConstructionHrmsAttendanceTeamMembersResponseModel,
  RejectConstructionHrmsAttendanceRequestModel,
} from "./attendance-models";

const HRMS = ["Construction · HRMS"];
const SESSION = [StatusCodes.UNAUTHORIZED, StatusCodes.FORBIDDEN] as const;
const WRITE = [
  StatusCodes.BAD_REQUEST,
  ...SESSION,
  StatusCodes.NOT_FOUND,
  StatusCodes.CONFLICT,
  StatusCodes.PAYMENT_REQUIRED,
] as const;
const ITEM = `${ATTENDANCE_PATH}/approvals/{id}`;

/** Attendance models (CM-308, CM-309). */
export const attendanceOpenApiComponents: OpenApiComponents = {
  ConstructionHrmsAttendanceEntryResponseModel,
  ConstructionHrmsAttendanceDayResponseModel,
  GetConstructionHrmsAttendanceTodayResponseModel,
  CheckInConstructionHrmsAttendanceRequestModel,
  CheckOutConstructionHrmsAttendanceRequestModel,
  AddConstructionHrmsMissedCheckoutRequestModel,
  AddConstructionHrmsManualAttendanceRequestModel,
  ListConstructionHrmsAttendanceApprovalsResponseModel,
  ApproveConstructionHrmsAttendanceRequestModel,
  RejectConstructionHrmsAttendanceRequestModel,
  GetConstructionHrmsTeamTodayResponseModel,
  ListConstructionHrmsAttendanceTeamMembersResponseModel,
  GetConstructionHrmsAttendanceMonthlySummaryResponseModel,
};

/** Attendance routes (CM-308, CM-309). */
export const attendanceOpenApiOperations: OpenApiOperation[] = [
  {
    method: "get",
    path: `${ATTENDANCE_PATH}/today`,
    summary:
      "My Attendance today: state, entries, the open entry and pending requests (menu `hrms.attendance`, read)",
    tags: HRMS,
    successStatus: StatusCodes.OK,
    successDescription: "Today for the signed-in Team Member",
    successSchema: GetConstructionHrmsAttendanceTodayResponseModel,
    errors: [...SESSION, StatusCodes.NOT_FOUND],
  },
  {
    method: "post",
    path: `${ATTENDANCE_PATH}/check-in`,
    summary:
      "Check In with the device location: OUTSIDE_FENCE / OFFICE_LOCATION_NOT_CONFIGURED when GPS is required, approvals under record only; ATTENDANCE_ALREADY_OPEN while an entry is open (menu `hrms.attendance`, create)",
    tags: HRMS,
    body: CheckInConstructionHrmsAttendanceRequestModel,
    successStatus: StatusCodes.CREATED,
    successDescription: "The open entry",
    successSchema: ConstructionHrmsAttendanceEntryResponseModel,
    errors: [...WRITE],
  },
  {
    method: "post",
    path: `${ATTENDANCE_PATH}/check-out`,
    summary:
      "Check Out: closes today's open entry (or last night's shift); ATTENDANCE_OPEN_FROM_EARLIER_DAY needs a missed checkout (menu `hrms.attendance`, create)",
    tags: HRMS,
    body: CheckOutConstructionHrmsAttendanceRequestModel,
    successStatus: StatusCodes.OK,
    successDescription: "The closed entry",
    successSchema: ConstructionHrmsAttendanceEntryResponseModel,
    errors: [...WRITE],
  },
  {
    method: "post",
    path: `${ATTENDANCE_PATH}/missed-checkout`,
    summary:
      "Add Missed Checkout for an entry left open on an earlier day, within 24 hours of its check-in; goes to approvals (menu `hrms.attendance`, create)",
    tags: HRMS,
    body: AddConstructionHrmsMissedCheckoutRequestModel,
    successStatus: StatusCodes.OK,
    successDescription: "The entry, pending approval",
    successSchema: ConstructionHrmsAttendanceEntryResponseModel,
    errors: [...WRITE],
  },
  {
    method: "post",
    path: `${ATTENDANCE_PATH}/manual`,
    summary:
      "Add Backdated Attendance for a past day; passes the Back-dated Entry policy for HRMS → Attendance; may not overlap; goes to approvals (menu `hrms.attendance`, create)",
    tags: HRMS,
    body: AddConstructionHrmsManualAttendanceRequestModel,
    successStatus: StatusCodes.CREATED,
    successDescription: "The entry, pending approval",
    successSchema: ConstructionHrmsAttendanceEntryResponseModel,
    errors: [...WRITE],
  },
  {
    method: "get",
    path: `${ATTENDANCE_PATH}/approvals`,
    summary:
      "Attendance Approvals: pending entries, oldest first; a Member does not see their own (menu `hrms.attendance`, approve or reject)",
    tags: HRMS,
    successStatus: StatusCodes.OK,
    successDescription: "Pending entries with their Team Members",
    successSchema: ListConstructionHrmsAttendanceApprovalsResponseModel,
    errors: [...SESSION],
  },
  {
    method: "post",
    path: `${ITEM}/approve`,
    summary:
      "Approve a pending entry; never one's own unless the Owner; ATTENDANCE_NOT_PENDING / ATTENDANCE_CHANGED (menu `hrms.attendance`, approve)",
    tags: HRMS,
    params: HrmsAttendanceIdParamsModel,
    body: ApproveConstructionHrmsAttendanceRequestModel,
    successStatus: StatusCodes.OK,
    successDescription: "The approved entry",
    successSchema: ConstructionHrmsAttendanceEntryResponseModel,
    errors: [...WRITE],
  },
  {
    method: "post",
    path: `${ITEM}/reject`,
    summary:
      "Reject a pending entry with a reason; never one's own unless the Owner (menu `hrms.attendance`, reject)",
    tags: HRMS,
    params: HrmsAttendanceIdParamsModel,
    body: RejectConstructionHrmsAttendanceRequestModel,
    successStatus: StatusCodes.OK,
    successDescription: "The rejected entry",
    successSchema: ConstructionHrmsAttendanceEntryResponseModel,
    errors: [...WRITE],
  },
  {
    method: "get",
    path: `${ATTENDANCE_PATH}/team-today`,
    summary:
      "Team Today: each active Team Member's state now, with counts (menu `hrms.attendance`, view all)",
    tags: HRMS,
    successStatus: StatusCodes.OK,
    successDescription: "Today's team",
    successSchema: GetConstructionHrmsTeamTodayResponseModel,
    errors: [...SESSION],
  },
  {
    method: "get",
    path: `${ATTENDANCE_PATH}/team-members`,
    summary:
      "The active Team Members the viewer can see (menu `hrms.attendance`, view all)",
    tags: HRMS,
    successStatus: StatusCodes.OK,
    successDescription: "Team Members by name",
    successSchema: ListConstructionHrmsAttendanceTeamMembersResponseModel,
    errors: [...SESSION],
  },
  {
    method: "get",
    path: `${ATTENDANCE_PATH}/monthly-summary`,
    summary:
      "Each member's month: day statuses and counts; everyone with view all, else one's own row (menu `hrms.attendance`, report)",
    tags: HRMS,
    query: ConstructionHrmsMonthRequestModel,
    successStatus: StatusCodes.OK,
    successDescription: "The month",
    successSchema: GetConstructionHrmsAttendanceMonthlySummaryResponseModel,
    errors: [StatusCodes.BAD_REQUEST, ...SESSION],
  },
  {
    method: "get",
    path: `${ATTENDANCE_PATH}/report/monthly`,
    summary:
      "The monthly attendance report as Excel: Summary and Days sheets (menu `hrms.attendance`, export)",
    tags: HRMS,
    query: ConstructionHrmsMonthRequestModel,
    successStatus: StatusCodes.OK,
    successDescription: "The workbook",
    successBinaryContentTypes: [XLSX_CONTENT_TYPE],
    errors: [StatusCodes.BAD_REQUEST, ...SESSION],
  },
];
