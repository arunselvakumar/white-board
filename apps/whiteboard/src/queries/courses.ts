import { queryOptions } from "@tanstack/react-query";

import { apiJson } from "./http";

export type CourseResponse = {
  id: string;
  name: string;
  duration: CourseDurationInput;
  code: string | null;
  category: string | null;
  totalLearningHours: number | null;
  eligibility: string | null;
  learningOutcomes: string[];
  syllabusOutline: string[];
  description: string | null;
  defaultFeeAmountPaise: number;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
  createdByUserId: string;
};

export type CourseListResponse = {
  items: CourseResponse[];
  nextCursor: string | null;
  prevCursor: string | null;
  total: number;
};

export type CourseListPage = {
  limit?: number;
  after?: string;
  before?: string;
};

export type CourseWriteInput = {
  name: string;
  duration: CourseDurationInput;
  code?: string | null;
  category?: string | null;
  totalLearningHours?: number | null;
  eligibility?: string | null;
  learningOutcomes?: string[];
  syllabusOutline?: string[];
  description?: string | null;
  defaultFeeAmountPaise: number;
};

export type CourseDurationInput =
  | { kind: "fixed"; value: number; unit: "days" | "weeks" | "months" }
  | { kind: "flexible" };

const jsonHeaders = { "content-type": "application/json" };

export const courseQueries = {
  key: {
    all: ["courses"] as const,
    list: (page?: CourseListPage) =>
      [...courseQueries.key.all, "list", page] as const,
    detail: (id: string) => [...courseQueries.key.all, "detail", id] as const,
  },
  list: (page?: CourseListPage) =>
    queryOptions({
      queryKey: courseQueries.key.list(page),
      queryFn: () => {
        const params = new URLSearchParams({
          limit: String(page?.limit ?? 100),
        });
        if (page?.after) params.set("after", page.after);
        if (page?.before) params.set("before", page.before);
        return apiJson<CourseListResponse>(`/api/courses?${params.toString()}`);
      },
    }),
  detail: (id: string) =>
    queryOptions({
      queryKey: courseQueries.key.detail(id),
      queryFn: () => apiJson<CourseResponse>(`/api/courses/${id}`),
    }),
};

export function createCourse(input: CourseWriteInput): Promise<CourseResponse> {
  return apiJson<CourseResponse>("/api/courses", {
    method: "POST",
    headers: jsonHeaders,
    body: JSON.stringify(input),
  });
}

export function updateCourse(
  id: string,
  input: CourseWriteInput,
): Promise<CourseResponse> {
  return apiJson<CourseResponse>(`/api/courses/${id}/update`, {
    method: "POST",
    headers: jsonHeaders,
    body: JSON.stringify(input),
  });
}

export function archiveCourse(id: string): Promise<CourseResponse> {
  return apiJson<CourseResponse>(`/api/courses/${id}/archive`, {
    method: "POST",
  });
}
