import { queryOptions } from "@tanstack/react-query";

import type { SaveProgressReportInput } from "@/src/preschool/application/progress-report-handlers";
import type {
  ChildProgressReportsView,
  ClassroomProgressReportsView,
  ProgressReportView,
} from "@/src/preschool/application/progress-report-views";
import type { ProgressRating, Term } from "@/src/preschool/domain/progress";

import { apiJson } from "../http";
import { preschoolKeys } from "./me";

export type PreschoolProgressReport = ProgressReportView;
export type PreschoolClassroomProgressReports = ClassroomProgressReportsView;
export type PreschoolChildProgressReports = ChildProgressReportsView;
export type PreschoolTerm = Term;
export type PreschoolProgressRating = ProgressRating;
export type SavePreschoolProgressReportInput = SaveProgressReportInput;

export {
  TERMS as PRESCHOOL_TERMS,
  TERM_LABELS as PRESCHOOL_TERM_LABELS,
} from "@/src/preschool/domain/progress";

const BASE = "/api/preschool/progress-reports";

export const preschoolProgressReportKeys = {
  all: [...preschoolKeys.all, "progress-reports"] as const,
  classroom: (classroomId: string, term: Term, academicYearId?: string) =>
    [
      ...preschoolProgressReportKeys.all,
      "classroom",
      classroomId,
      term,
      academicYearId ?? null,
    ] as const,
  child: (childId: string) =>
    [...preschoolProgressReportKeys.all, "child", childId] as const,
  detail: (id: string) =>
    [...preschoolProgressReportKeys.all, "detail", id] as const,
};

export function preschoolClassroomProgressReportsQueryOptions(
  classroomId: string,
  term: Term,
  academicYearId?: string,
) {
  const params = new URLSearchParams({ classroomId, term });
  if (academicYearId != null) params.set("academicYearId", academicYearId);
  return queryOptions({
    queryKey: preschoolProgressReportKeys.classroom(
      classroomId,
      term,
      academicYearId,
    ),
    queryFn: ({ meta }) =>
      apiJson<PreschoolClassroomProgressReports>(
        `${BASE}?${params.toString()}`,
        {},
        meta,
      ),
  });
}

export function preschoolChildProgressReportsQueryOptions(childId: string) {
  return queryOptions({
    queryKey: preschoolProgressReportKeys.child(childId),
    queryFn: ({ meta }) =>
      apiJson<PreschoolChildProgressReports>(
        `${BASE}/children/${childId}`,
        {},
        meta,
      ),
  });
}

export function preschoolProgressReportQueryOptions(id: string) {
  return queryOptions({
    queryKey: preschoolProgressReportKeys.detail(id),
    queryFn: ({ meta }) =>
      apiJson<PreschoolProgressReport>(`${BASE}/${id}`, {}, meta),
  });
}

function post<T>(path: string, body: unknown = {}): Promise<T> {
  return apiJson<T>(`${BASE}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

export function savePreschoolProgressReport(
  input: SavePreschoolProgressReportInput,
): Promise<PreschoolProgressReport> {
  return post("/save", input);
}

export function publishPreschoolProgressReport(
  id: string,
): Promise<PreschoolProgressReport> {
  return post(`/${id}/publish`);
}

export function unpublishPreschoolProgressReport(
  id: string,
): Promise<PreschoolProgressReport> {
  return post(`/${id}/unpublish`);
}

export const PRESCHOOL_RATING_LABELS: Record<ProgressRating, string> = {
  beginning: "Beginning",
  progressing: "Progressing",
  proficient: "Proficient",
};

/** What each rating means, for the printed key. */
export const PRESCHOOL_RATING_KEY: Record<ProgressRating, string> = {
  beginning: "Starting to show this; needs a lot of support.",
  progressing: "Shows this often, with some support.",
  proficient: "Shows this confidently on their own.",
};
