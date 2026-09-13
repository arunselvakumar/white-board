import { queryOptions } from "@tanstack/react-query";

import { apiJson } from "./http";

export type StudentEnrollmentSummary = {
  id: string;
  courseId: string;
  batchId: string;
  classModeOverride: "offline" | "online" | "hybrid" | null;
  timingSource: "batch" | "student";
  endedAt: string | null;
  feePlanAmountPaise: number;
  remainingDuesPaise: number;
};

export type StudentResponse = {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  photoUrl: string | null;
  address: string | null;
  idProofNote: string | null;
  guardianName: string | null;
  guardianPhone: string | null;
  droppedAt: string | null;
  createdAt: string;
  updatedAt: string;
  createdByUserId: string;
  enrollments?: StudentEnrollmentSummary[];
};

export type StudentListResponse = {
  items: StudentResponse[];
  nextCursor: string | null;
  prevCursor: string | null;
  total: number;
};

export type StudentWriteInput = {
  name: string;
  phone: string;
  email?: string | null;
  photoUrl?: string | null;
  address?: string | null;
  idProofNote?: string | null;
  guardianName?: string | null;
  guardianPhone?: string | null;
};

const jsonHeaders = { "content-type": "application/json" };

export const studentQueries = {
  key: {
    all: ["students"] as const,
    list: (q?: string) => [...studentQueries.key.all, "list", q] as const,
    detail: (id: string) => [...studentQueries.key.all, "detail", id] as const,
  },
  list: (q?: string) =>
    queryOptions({
      queryKey: studentQueries.key.list(q),
      queryFn: () => {
        const params = new URLSearchParams({ limit: "100" });
        if (q != null && q.length > 0) {
          params.set("q", q);
        }
        return apiJson<StudentListResponse>(`/api/students?${params.toString()}`);
      },
    }),
  detail: (id: string) =>
    queryOptions({
      queryKey: studentQueries.key.detail(id),
      queryFn: () => apiJson<StudentResponse>(`/api/students/${id}`),
    }),
};

export function createStudent(
  input: StudentWriteInput,
): Promise<StudentResponse> {
  return apiJson<StudentResponse>("/api/students", {
    method: "POST",
    headers: jsonHeaders,
    body: JSON.stringify(input),
  });
}

export function updateStudentProfile(
  id: string,
  input: StudentWriteInput,
): Promise<StudentResponse> {
  return apiJson<StudentResponse>(`/api/students/${id}/profile`, {
    method: "POST",
    headers: jsonHeaders,
    body: JSON.stringify(input),
  });
}

export function dropStudent(id: string): Promise<StudentResponse> {
  return apiJson<StudentResponse>(`/api/students/${id}/drop`, {
    method: "POST",
  });
}
