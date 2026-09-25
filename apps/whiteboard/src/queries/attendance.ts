import { queryOptions } from "@tanstack/react-query";
import { apiJson } from "./http";

export type AttendanceStatus =
  "unmarked" | "present" | "absent" | "late" | "excused";
export type AttendanceMark = {
  id: string;
  enrollmentId: string;
  studentId: string;
  studentName: string;
  status: AttendanceStatus;
  note: string | null;
  markedByUserId: string | null;
  markedAt: string | null;
};
export type AttendanceRegister = {
  id: string;
  batchId: string;
  date: string;
  timezone: string;
  createdAt: string;
  updatedAt: string;
  marks: AttendanceMark[];
  summary: {
    total: number;
    unmarked: number;
    present: number;
    absent: number;
    late: number;
    excused: number;
    attended: number;
    complete: boolean;
  };
};
export type AttendanceHistory = {
  items: {
    id: string;
    registerId: string;
    batchId: string;
    batchName: string;
    date: string;
    status: AttendanceStatus;
    note: string | null;
  }[];
  total: number;
  nextCursor: string | null;
  prevCursor: string | null;
};

export const attendanceQueries = {
  key: { all: ["attendance"] as const },
  batch: (
    workspaceId: string | null | undefined,
    userId: string | null | undefined,
    batchId: string,
    cursor?: { after?: string; before?: string },
  ) =>
    queryOptions({
      queryKey: [
        ...attendanceQueries.key.all,
        workspaceId,
        userId,
        "batch",
        batchId,
        cursor,
      ],
      queryFn: () => {
        const params = new URLSearchParams({ batchId });
        if (cursor?.after) params.set("after", cursor.after);
        if (cursor?.before) params.set("before", cursor.before);
        return apiJson<{
          items: AttendanceRegister[];
          total: number;
          nextCursor: string | null;
          prevCursor: string | null;
        }>(`/api/attendance/registers?${params.toString()}`);
      },
    }),
  student: (
    workspaceId: string | null | undefined,
    studentId: string,
    cursor?: { after?: string; before?: string },
  ) =>
    queryOptions({
      queryKey: [
        ...attendanceQueries.key.all,
        workspaceId,
        "student",
        studentId,
        cursor,
      ],
      queryFn: () => {
        const params = new URLSearchParams();
        if (cursor?.after) params.set("after", cursor.after);
        if (cursor?.before) params.set("before", cursor.before);
        return apiJson<AttendanceHistory>(
          `/api/students/${studentId}/attendance?${params.toString()}`,
        );
      },
    }),
};

const headers = { "content-type": "application/json" };
export const openAttendanceRegister = (batchId: string, date?: string) =>
  apiJson<AttendanceRegister>("/api/attendance/registers", {
    method: "POST",
    headers,
    body: JSON.stringify({ batchId, ...(date == null ? {} : { date }) }),
  });
export const saveAttendanceMarks = (
  id: string,
  marks: {
    enrollmentId: string;
    status: AttendanceStatus;
    note: string | null;
  }[],
) =>
  apiJson<AttendanceRegister>(`/api/attendance/registers/${id}/marks`, {
    method: "POST",
    headers,
    body: JSON.stringify({ marks }),
  });
