import {
  queryOptions,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";

import type {
  ClearConstructionLabourEmployeeAttendanceRequestModel,
  ConstructionLabourEmployeeAttendanceDayResponseModel,
  GetConstructionLabourEmployeeAttendanceMonthResponseModel,
  GetConstructionLabourEmployeeAttendanceSheetResponseModel,
  ListConstructionLabourEmployeeAttendanceResponseModel,
  MarkConstructionLabourEmployeeAttendanceRequestModel,
  MarkConstructionLabourEmployeeAttendanceResponseModel,
} from "@/app/api/construction/labour/attendance/labour/labour-attendance-models";

import { apiJson } from "./http";

export type EmployeeAttendanceDay =
  ConstructionLabourEmployeeAttendanceDayResponseModel;
export type EmployeeSheet =
  GetConstructionLabourEmployeeAttendanceSheetResponseModel;
export type EmployeeSheetRow = EmployeeSheet["employees"][number];
export type EmployeeAttendanceMonth =
  GetConstructionLabourEmployeeAttendanceMonthResponseModel;
export type EmployeeAttendanceList =
  ListConstructionLabourEmployeeAttendanceResponseModel;
export type MarkEmployeeDayInput =
  MarkConstructionLabourEmployeeAttendanceRequestModel;
export type ClearEmployeeDayInput =
  ClearConstructionLabourEmployeeAttendanceRequestModel;
export type AttendanceStatus = EmployeeAttendanceDay["status"];

export const LABOUR_ATTENDANCE_API =
  "/api/construction/labour/attendance/labour";

/** Every labour attendance query key starts here. */
export const LABOUR_ATTENDANCE_KEY = ["labour", "labour-attendance"] as const;

function search(params: Record<string, string | undefined>): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params))
    if (value != null && value.length > 0) query.set(key, value);
  return query.toString();
}

function postJson<T>(url: string, body: unknown): Promise<T> {
  return apiJson<T>(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

/** The marking sheet for a Project and date. */
export function employeeSheetQuery(projectId: string, date: string) {
  return queryOptions({
    queryKey: [...LABOUR_ATTENDANCE_KEY, "sheet", projectId, date],
    queryFn: () =>
      apiJson<EmployeeSheet>(
        `${LABOUR_ATTENDANCE_API}/sheet?${search({ projectId, date })}`,
      ),
  });
}

export function employeeAttendanceMonthQuery(projectId: string, month: string) {
  return queryOptions({
    queryKey: [...LABOUR_ATTENDANCE_KEY, "month", projectId, month],
    queryFn: () =>
      apiJson<EmployeeAttendanceMonth>(
        `${LABOUR_ATTENDANCE_API}/month?${search({ projectId, month })}`,
      ),
  });
}

export type EmployeeAttendanceListFilter = {
  projectId: string;
  from?: string;
  to?: string;
  employeeId?: string;
  status?: string;
  cursor?: { after: string } | { before: string } | null;
};

export function employeeAttendanceListQuery(
  filter: EmployeeAttendanceListFilter,
) {
  const query = search({
    projectId: filter.projectId,
    from: filter.from,
    to: filter.to,
    employeeId: filter.employeeId,
    status: filter.status,
    limit: "25",
    after:
      filter.cursor != null && "after" in filter.cursor
        ? filter.cursor.after
        : undefined,
    before:
      filter.cursor != null && "before" in filter.cursor
        ? filter.cursor.before
        : undefined,
  });
  return queryOptions({
    queryKey: [...LABOUR_ATTENDANCE_KEY, "list", query],
    queryFn: () =>
      apiJson<EmployeeAttendanceList>(`${LABOUR_ATTENDANCE_API}?${query}`),
  });
}

export function markEmployeeDay(
  input: MarkEmployeeDayInput,
): Promise<MarkConstructionLabourEmployeeAttendanceResponseModel> {
  return postJson(`${LABOUR_ATTENDANCE_API}/mark`, input);
}

export function clearEmployeeDay(input: ClearEmployeeDayInput): Promise<void> {
  return postJson(`${LABOUR_ATTENDANCE_API}/clear`, input);
}

export function setEmployeePaidLeave(input: {
  id: string;
  isPaidLeave: boolean;
  expectedUpdatedAt: string;
}): Promise<EmployeeAttendanceDay> {
  return postJson(
    `${LABOUR_ATTENDANCE_API}/${encodeURIComponent(input.id)}/paid-leave`,
    {
      isPaidLeave: input.isPaidLeave,
      expectedUpdatedAt: input.expectedUpdatedAt,
    },
  );
}

function useInvalidate() {
  const queryClient = useQueryClient();
  return () =>
    queryClient.invalidateQueries({ queryKey: LABOUR_ATTENDANCE_KEY });
}

export function useMarkEmployeeDay() {
  const invalidate = useInvalidate();
  return useMutation({ mutationFn: markEmployeeDay, onSuccess: invalidate });
}

export function useClearEmployeeDay() {
  const invalidate = useInvalidate();
  return useMutation({ mutationFn: clearEmployeeDay, onSuccess: invalidate });
}

export function useSetEmployeePaidLeave() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: setEmployeePaidLeave,
    onSuccess: invalidate,
  });
}
