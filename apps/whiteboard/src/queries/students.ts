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

export type StudentSalutation =
  "mr" | "mrs" | "ms" | "miss" | "mx" | "dr" | "prof";
export type StudentGender =
  "female" | "male" | "non_binary" | "prefer_not_to_say";
export type StudentEducationStatus = "school" | "completed" | "other";
export type StudentParentDetails = {
  salutation: StudentSalutation | null;
  gender: StudentGender | null;
  name: string | null;
  primaryPhone: string | null;
  alternatePhone: string | null;
  occupation: string | null;
  email: string | null;
};
export type StudentGuardianDetails = {
  salutation: StudentSalutation | null;
  gender: StudentGender | null;
  name: string;
  relationship: string | null;
  phone: string | null;
  email: string | null;
};
export type StudentDetails = {
  salutation: StudentSalutation | null;
  gender: StudentGender | null;
  dateOfBirth: string | null;
  educationStatus: StudentEducationStatus | null;
  currentInstitution: string | null;
  currentGrade: string | null;
  schoolBoard: string | null;
  highestQualification: string | null;
  father: StudentParentDetails;
  mother: StudentParentDetails;
  guardians: StudentGuardianDetails[];
  emergencyPhone: string | null;
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
  details: StudentDetails;
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

export type StudentListPage = {
  limit?: number;
  after?: string;
  before?: string;
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
} & Partial<StudentDetails>;

const jsonHeaders = { "content-type": "application/json" };

export const studentQueries = {
  key: {
    all: ["students"] as const,
    list: (q?: string, page?: StudentListPage) =>
      [...studentQueries.key.all, "list", q, page] as const,
    detail: (id: string) => [...studentQueries.key.all, "detail", id] as const,
  },
  list: (q?: string, page?: StudentListPage) =>
    queryOptions({
      queryKey: studentQueries.key.list(q, page),
      queryFn: () => {
        const params = new URLSearchParams({
          limit: String(page?.limit ?? 100),
        });
        if (q != null && q.length > 0) {
          params.set("q", q);
        }
        if (page?.after != null) {
          params.set("after", page.after);
        }
        if (page?.before != null) {
          params.set("before", page.before);
        }
        return apiJson<StudentListResponse>(
          `/api/training-institute/students?${params.toString()}`,
        );
      },
    }),
  detail: (id: string) =>
    queryOptions({
      queryKey: studentQueries.key.detail(id),
      queryFn: () =>
        apiJson<StudentResponse>(`/api/training-institute/students/${id}`),
    }),
};

export function createStudent(
  input: StudentWriteInput,
  requestId?: string,
): Promise<StudentResponse> {
  return apiJson<StudentResponse>("/api/training-institute/students", {
    method: "POST",
    headers: jsonHeaders,
    body: JSON.stringify({ ...input, requestId }),
  });
}

export function updateStudentProfile(
  id: string,
  input: StudentWriteInput,
): Promise<StudentResponse> {
  return apiJson<StudentResponse>(
    `/api/training-institute/students/${id}/profile`,
    {
      method: "POST",
      headers: jsonHeaders,
      body: JSON.stringify(input),
    },
  );
}

export function dropStudent(id: string): Promise<StudentResponse> {
  return apiJson<StudentResponse>(
    `/api/training-institute/students/${id}/drop`,
    {
      method: "POST",
    },
  );
}
