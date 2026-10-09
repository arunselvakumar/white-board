import {
  queryOptions,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";

import type {
  ConstructionLabourVendorAttendanceDayResponseModel,
  GetConstructionLabourVendorAttendanceDayResponseModel,
  GetConstructionLabourVendorAttendanceMonthResponseModel,
  GetConstructionLabourVendorAttendanceOvertimeResponseModel,
  ListConstructionLabourVendorAttendanceResponseModel,
  RecordConstructionLabourVendorAttendanceRequestModel,
} from "@/app/api/construction/labour/attendance/vendors/vendor-attendance-models";

import { apiJson } from "./http";

export type VendorAttendanceDay =
  ConstructionLabourVendorAttendanceDayResponseModel;
export type VendorAttendanceGrid =
  GetConstructionLabourVendorAttendanceDayResponseModel;
export type VendorAttendanceGridRow = VendorAttendanceGrid["vendors"][number];
export type VendorAttendanceMonth =
  GetConstructionLabourVendorAttendanceMonthResponseModel;
export type VendorAttendanceOvertime =
  GetConstructionLabourVendorAttendanceOvertimeResponseModel;
export type VendorAttendanceList =
  ListConstructionLabourVendorAttendanceResponseModel;
export type RecordVendorDayInput =
  RecordConstructionLabourVendorAttendanceRequestModel;

export const VENDOR_ATTENDANCE_API =
  "/api/construction/labour/attendance/vendors";

/** Every vendor attendance query key starts here. */
export const VENDOR_ATTENDANCE_KEY = ["labour", "vendor-attendance"] as const;

function search(params: Record<string, string | undefined>): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params))
    if (value != null && value.length > 0) query.set(key, value);
  return query.toString();
}

/** The marking grid for a Project and date. */
export function vendorAttendanceDayQuery(projectId: string, date: string) {
  return queryOptions({
    queryKey: [...VENDOR_ATTENDANCE_KEY, "day", projectId, date],
    queryFn: () =>
      apiJson<VendorAttendanceGrid>(
        `${VENDOR_ATTENDANCE_API}/day?${search({ projectId, date })}`,
      ),
  });
}

export function vendorAttendanceMonthQuery(projectId: string, month: string) {
  return queryOptions({
    queryKey: [...VENDOR_ATTENDANCE_KEY, "month", projectId, month],
    queryFn: () =>
      apiJson<VendorAttendanceMonth>(
        `${VENDOR_ATTENDANCE_API}/month?${search({ projectId, month })}`,
      ),
  });
}

export function vendorAttendanceOvertimeQuery(
  projectId: string,
  from: string,
  to: string,
) {
  return queryOptions({
    queryKey: [...VENDOR_ATTENDANCE_KEY, "overtime", projectId, from, to],
    queryFn: () =>
      apiJson<VendorAttendanceOvertime>(
        `${VENDOR_ATTENDANCE_API}/overtime?${search({ projectId, from, to })}`,
      ),
  });
}

export function vendorAttendanceListQuery(filter: {
  projectId: string;
  from?: string;
  to?: string;
  vendorId?: string;
  categoryId?: string;
  page?: number;
}) {
  const query = search({
    projectId: filter.projectId,
    from: filter.from,
    to: filter.to,
    vendorId: filter.vendorId,
    categoryId: filter.categoryId,
    page: filter.page == null ? undefined : String(filter.page),
  });
  return queryOptions({
    queryKey: [...VENDOR_ATTENDANCE_KEY, "list", query],
    queryFn: () =>
      apiJson<VendorAttendanceList>(`${VENDOR_ATTENDANCE_API}?${query}`),
  });
}

export function recordVendorDay(
  input: RecordVendorDayInput,
): Promise<VendorAttendanceDay> {
  return apiJson(`${VENDOR_ATTENDANCE_API}/record`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
}

export function clearVendorDay(input: {
  id: string;
  expectedUpdatedAt: string;
}): Promise<void> {
  return apiJson(
    `${VENDOR_ATTENDANCE_API}/${encodeURIComponent(input.id)}/clear`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ expectedUpdatedAt: input.expectedUpdatedAt }),
    },
  );
}

function useInvalidate() {
  const queryClient = useQueryClient();
  return () =>
    queryClient.invalidateQueries({ queryKey: VENDOR_ATTENDANCE_KEY });
}

export function useRecordVendorDay() {
  const invalidate = useInvalidate();
  return useMutation({ mutationFn: recordVendorDay, onSuccess: invalidate });
}

export function useClearVendorDay() {
  const invalidate = useInvalidate();
  return useMutation({ mutationFn: clearVendorDay, onSuccess: invalidate });
}
