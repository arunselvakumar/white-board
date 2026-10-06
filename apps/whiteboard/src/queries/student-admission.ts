import { queryOptions } from "@tanstack/react-query";

import { apiJson, QueryHttpError } from "./http";
import type { BatchResponse } from "./batches";
import type { CourseResponse } from "./courses";
import {
  enrollStudent,
  type EnrollmentResponse,
  type EnrollInput,
} from "./enrollments";
import {
  createStudent,
  type StudentResponse,
  type StudentWriteInput,
} from "./students";

export type AdmissionBatchOption = { id: string; label: string };

async function allPages<T>(
  path: string,
  filters?: Record<string, string>,
): Promise<T[]> {
  const items: T[] = [];
  const seen = new Set<string>();
  let cursor: string | null = null;
  do {
    const params = new URLSearchParams({ limit: "100", ...filters });
    if (cursor != null) params.set("after", cursor);
    const page: { items: T[]; nextCursor: string | null } = await apiJson(
      `${path}?${params.toString()}`,
    );
    items.push(...page.items);
    cursor = page.nextCursor;
    if (cursor != null) {
      if (seen.has(cursor)) throw new Error("Could not load all records.");
      seen.add(cursor);
    }
  } while (cursor != null);
  return items;
}

export const studentAdmissionQueries = {
  key: { all: ["student-admission"] as const },
  batchOptions: (workspaceId: string | null | undefined) =>
    queryOptions({
      queryKey: [
        ...studentAdmissionQueries.key.all,
        workspaceId,
        "batch-options",
      ],
      staleTime: 0,
      refetchOnMount: "always",
      queryFn: async (): Promise<AdmissionBatchOption[]> => {
        const [courses, batches] = await Promise.all([
          allPages<CourseResponse>("/api/training-institute/courses"),
          allPages<BatchResponse>("/api/training-institute/batches"),
        ]);
        const activeCourses = new Map(
          courses
            .filter((course) => course.archivedAt == null)
            .map((course) => [course.id, course.name]),
        );
        return batches
          .filter(
            (batch) =>
              batch.closedAt == null &&
              batch.enrolledCount < batch.capacity &&
              activeCourses.has(batch.courseId),
          )
          .map((batch) => ({
            id: batch.id,
            label: `${activeCourses.get(batch.courseId)} · ${batch.name}`,
          }))
          .sort((a, b) => a.label.localeCompare(b.label));
      },
    }),
};

type AdmissionOperations = {
  create: (
    input: StudentWriteInput,
    requestId?: string,
  ) => Promise<StudentResponse>;
  enroll: (input: EnrollInput) => Promise<unknown>;
  hasEnrollment: (studentId: string, batchId: string) => Promise<boolean>;
};

export type AdmissionResult =
  | { student: StudentResponse; enrollment: "skipped" | "enrolled" }
  | {
      student: StudentResponse;
      enrollment: "failed";
      batchId: string;
      error: unknown;
      uncertain: boolean;
    };

export async function hasAdmissionEnrollment(
  studentId: string,
  batchId: string,
): Promise<boolean> {
  const enrollments = await allPages<EnrollmentResponse>(
    "/api/training-institute/enrollments",
    {
      studentId,
      batchId,
    },
  );
  return enrollments.some((item) => item.endedAt == null);
}

export async function completeAdmissionEnrollment(
  student: StudentResponse,
  batchId: string,
  operations: Pick<AdmissionOperations, "enroll" | "hasEnrollment"> = {
    enroll: enrollStudent,
    hasEnrollment: hasAdmissionEnrollment,
  },
): Promise<AdmissionResult> {
  try {
    if (await operations.hasEnrollment(student.id, batchId)) {
      return { student, enrollment: "enrolled" };
    }
  } catch (error) {
    return { student, enrollment: "failed", batchId, error, uncertain: true };
  }
  try {
    await operations.enroll({
      studentId: student.id,
      batchId,
      timingSource: "batch",
      classModeOverride: null,
    });
    return { student, enrollment: "enrolled" };
  } catch (error) {
    try {
      if (await operations.hasEnrollment(student.id, batchId)) {
        return { student, enrollment: "enrolled" };
      }
    } catch {
      return { student, enrollment: "failed", batchId, error, uncertain: true };
    }
    const uncertain = !(error instanceof QueryHttpError) || error.status >= 500;
    return { student, enrollment: "failed", batchId, error, uncertain };
  }
}

export async function admitStudent(
  input: StudentWriteInput,
  batchId: string | null,
  requestId?: string,
  onStudentCreated?: (student: StudentResponse) => void,
  operations: AdmissionOperations = {
    create: createStudent,
    enroll: enrollStudent,
    hasEnrollment: hasAdmissionEnrollment,
  },
): Promise<AdmissionResult> {
  const student = await operations.create(input, requestId);
  onStudentCreated?.(student);
  if (batchId == null) return { student, enrollment: "skipped" };
  return completeAdmissionEnrollment(student, batchId, operations);
}
