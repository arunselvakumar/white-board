import { queryOptions } from "@tanstack/react-query";

import type { CheckOutInput } from "@/src/preschool/application/attendance-handlers";
import type {
  AttendanceMarkView,
  AttendanceRosterChildView,
  CentreAttendanceSummaryView,
  ChildAttendanceDayView,
  ChildAttendanceMonthView,
  ClassroomAttendanceMonthView,
  ClassroomAttendanceView,
} from "@/src/preschool/application/attendance-views";
import type {
  AttendanceStatus,
  CollectedByKind,
} from "@/src/preschool/domain/attendance";

import { apiJson } from "../http";
import { preschoolKeys } from "./me";

export type PreschoolAttendanceDay = ClassroomAttendanceView;
export type PreschoolAttendanceRosterChild = AttendanceRosterChildView;
export type PreschoolAttendanceMark = AttendanceMarkView;
export type PreschoolChildAttendanceDay = ChildAttendanceDayView;
export type PreschoolClassroomAttendanceMonth = ClassroomAttendanceMonthView;
export type PreschoolAttendanceSummary = CentreAttendanceSummaryView;
export type PreschoolChildAttendanceMonth = ChildAttendanceMonthView;
export type PreschoolAttendanceStatus = AttendanceStatus;
export type PreschoolCollectedByKind = CollectedByKind;
export type PreschoolCheckOutInput = CheckOutInput;

const BASE = "/api/preschool/attendance";

export const preschoolAttendanceKeys = {
  all: [...preschoolKeys.all, "attendance"] as const,
  day: (classroomId: string, date?: string) =>
    [...preschoolAttendanceKeys.all, "day", classroomId, date ?? null] as const,
  month: (classroomId: string, month: string) =>
    [...preschoolAttendanceKeys.all, "month", classroomId, month] as const,
  summary: (centreId: string, date?: string) =>
    [
      ...preschoolAttendanceKeys.all,
      "summary",
      centreId,
      date ?? null,
    ] as const,
  child: (childId: string, month: string) =>
    [...preschoolAttendanceKeys.all, "child", childId, month] as const,
};

function search(values: Record<string, string | undefined>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(values))
    if (value !== undefined && value !== "") params.set(key, value);
  return params.toString();
}

/** A Classroom's register; `date` is today in India when left out. */
export function preschoolAttendanceDayQueryOptions(
  classroomId: string,
  date?: string,
) {
  return queryOptions({
    queryKey: preschoolAttendanceKeys.day(classroomId, date),
    queryFn: ({ meta }) =>
      apiJson<PreschoolAttendanceDay>(
        `${BASE}?${search({ classroomId, date })}`,
        {},
        meta,
      ),
  });
}

export function preschoolAttendanceMonthQueryOptions(
  classroomId: string,
  month: string,
) {
  return queryOptions({
    queryKey: preschoolAttendanceKeys.month(classroomId, month),
    queryFn: ({ meta }) =>
      apiJson<PreschoolClassroomAttendanceMonth>(
        `${BASE}/month?${search({ classroomId, month })}`,
        {},
        meta,
      ),
  });
}

export function preschoolAttendanceSummaryQueryOptions(
  centreId: string,
  date?: string,
) {
  return queryOptions({
    queryKey: preschoolAttendanceKeys.summary(centreId, date),
    queryFn: ({ meta }) =>
      apiJson<PreschoolAttendanceSummary>(
        `${BASE}/summary?${search({ centreId, date })}`,
        {},
        meta,
      ),
  });
}

export function preschoolChildAttendanceQueryOptions(
  childId: string,
  month: string,
) {
  return queryOptions({
    queryKey: preschoolAttendanceKeys.child(childId, month),
    queryFn: ({ meta }) =>
      apiJson<PreschoolChildAttendanceMonth>(
        `${BASE}/children/${childId}?${search({ month })}`,
        {},
        meta,
      ),
  });
}

function post<T>(path: string, body: unknown): Promise<T> {
  return apiJson<T>(`${BASE}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

export function markPreschoolAttendance(input: {
  classroomId: string;
  date?: string;
  marks: { childId: string; status: AttendanceStatus }[];
}): Promise<PreschoolAttendanceDay> {
  return post("/mark", input);
}

export function checkInPreschoolChild(input: {
  childId: string;
  date?: string;
  time?: string;
  droppedBy?: string | null;
}): Promise<PreschoolChildAttendanceDay> {
  return post("/check-in", input);
}

export function checkOutPreschoolChild(
  input: PreschoolCheckOutInput,
): Promise<PreschoolChildAttendanceDay> {
  return post("/check-out", input);
}

export function undoPreschoolCheckOut(input: {
  childId: string;
  date?: string;
}): Promise<PreschoolChildAttendanceDay> {
  return post("/undo-check-out", input);
}

export function clearPreschoolAttendance(input: {
  childId: string;
  date?: string;
}): Promise<PreschoolChildAttendanceDay> {
  return post("/clear", input);
}

export const PRESCHOOL_ATTENDANCE_STATUS_LABELS: Record<
  AttendanceStatus,
  string
> = { present: "Present", absent: "Absent", leave: "Leave" };

export const PRESCHOOL_COLLECTED_BY_LABELS: Record<CollectedByKind, string> = {
  father: "Father",
  mother: "Mother",
  authorised_pickup: "Authorised Pickup",
  other: "Someone else",
};
