import { queryOptions } from "@tanstack/react-query";

import type {
  AddConstructionHrmsManualAttendanceRequestModel,
  AddConstructionHrmsMissedCheckoutRequestModel,
  CheckInConstructionHrmsAttendanceRequestModel,
  ConstructionHrmsAttendanceDayResponseModel,
  ConstructionHrmsAttendanceEntryResponseModel,
  GetConstructionHrmsAttendanceMonthlySummaryResponseModel,
  GetConstructionHrmsAttendanceTodayResponseModel,
  GetConstructionHrmsTeamTodayResponseModel,
  ListConstructionHrmsAttendanceApprovalsResponseModel,
} from "@/app/api/construction/hrms/attendance/attendance-models";

import { HRMS_KEY } from "./hrms-settings";
import { apiJson } from "./http";

const ATTENDANCE = "/api/construction/hrms/attendance";

export const HRMS_ATTENDANCE_KEY = [...HRMS_KEY, "attendance"] as const;

export type HrmsAttendanceEntry = ConstructionHrmsAttendanceEntryResponseModel;
export type HrmsAttendanceDay = ConstructionHrmsAttendanceDayResponseModel;
export type HrmsAttendanceToday =
  GetConstructionHrmsAttendanceTodayResponseModel;
export type HrmsAttendanceApprovals =
  ListConstructionHrmsAttendanceApprovalsResponseModel;
export type HrmsTeamToday = GetConstructionHrmsTeamTodayResponseModel;
export type HrmsAttendanceMonth =
  GetConstructionHrmsAttendanceMonthlySummaryResponseModel;
export type HrmsDeviceLocation = CheckInConstructionHrmsAttendanceRequestModel;

/** My Attendance today (CM-309). */
export const hrmsAttendanceTodayQuery = queryOptions({
  queryKey: [...HRMS_ATTENDANCE_KEY, "today"],
  queryFn: () => apiJson<HrmsAttendanceToday>(`${ATTENDANCE}/today`),
});

/** Pending entries for approvers (CM-309). */
export const hrmsAttendanceApprovalsQuery = queryOptions({
  queryKey: [...HRMS_ATTENDANCE_KEY, "approvals"],
  queryFn: () => apiJson<HrmsAttendanceApprovals>(`${ATTENDANCE}/approvals`),
});

/** Team Today (CM-309). */
export const hrmsTeamTodayQuery = queryOptions({
  queryKey: [...HRMS_ATTENDANCE_KEY, "team-today"],
  queryFn: () => apiJson<HrmsTeamToday>(`${ATTENDANCE}/team-today`),
});

/** The monthly summary for `YYYY-MM` (CM-309). */
export function hrmsAttendanceMonthQuery(month: string) {
  return queryOptions({
    queryKey: [...HRMS_ATTENDANCE_KEY, "monthly", month],
    queryFn: () =>
      apiJson<HrmsAttendanceMonth>(
        `${ATTENDANCE}/monthly-summary?month=${encodeURIComponent(month)}`,
      ),
  });
}

/** The monthly Excel report's address. */
export function hrmsAttendanceReportUrl(month: string): string {
  return `${ATTENDANCE}/report/monthly?month=${encodeURIComponent(month)}`;
}

function post<T>(url: string, body: unknown): Promise<T> {
  return apiJson<T>(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

export function checkInHrmsAttendance(
  location: HrmsDeviceLocation,
): Promise<HrmsAttendanceEntry> {
  return post(`${ATTENDANCE}/check-in`, location);
}

export function checkOutHrmsAttendance(
  location: HrmsDeviceLocation,
): Promise<HrmsAttendanceEntry> {
  return post(`${ATTENDANCE}/check-out`, location);
}

export function addHrmsMissedCheckout(
  input: AddConstructionHrmsMissedCheckoutRequestModel,
): Promise<HrmsAttendanceEntry> {
  return post(`${ATTENDANCE}/missed-checkout`, input);
}

export function addHrmsManualAttendance(
  input: AddConstructionHrmsManualAttendanceRequestModel,
): Promise<HrmsAttendanceEntry> {
  return post(`${ATTENDANCE}/manual`, input);
}

export function approveHrmsAttendance(
  id: string,
  expectedUpdatedAt: string,
): Promise<HrmsAttendanceEntry> {
  return post(`${ATTENDANCE}/approvals/${id}/approve`, { expectedUpdatedAt });
}

export function rejectHrmsAttendance(
  id: string,
  input: { expectedUpdatedAt: string; reason: string },
): Promise<HrmsAttendanceEntry> {
  return post(`${ATTENDANCE}/approvals/${id}/reject`, input);
}
