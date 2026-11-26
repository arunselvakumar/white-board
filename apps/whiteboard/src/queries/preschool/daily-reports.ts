import { queryOptions } from "@tanstack/react-query";

import type {
  ApplyToClassroomInput,
  SaveDailyReportInput,
} from "@/src/preschool/application/daily-report-handlers";
import type {
  ChildDailyReportsView,
  ClassroomDailyReportsView,
  DailyReportView,
  PublishDailyReportsView,
} from "@/src/preschool/application/daily-report-views";
import type {
  Ate,
  Meal,
  Mood,
  ToiletKind,
} from "@/src/preschool/domain/daily-report";

import { apiJson } from "../http";
import { preschoolKeys } from "./me";

export type PreschoolDailyReport = DailyReportView;
export type PreschoolClassroomDailyReports = ClassroomDailyReportsView;
export type PreschoolChildDailyReports = ChildDailyReportsView;
export type PreschoolPublishDailyReportsResult = PublishDailyReportsView;
export type SavePreschoolDailyReportInput = SaveDailyReportInput;
export type ApplyPreschoolDailyReportInput = ApplyToClassroomInput;

const BASE = "/api/preschool/daily-reports";

export const preschoolDailyReportKeys = {
  all: [...preschoolKeys.all, "daily-reports"] as const,
  day: (classroomId: string, date?: string) =>
    [
      ...preschoolDailyReportKeys.all,
      "day",
      classroomId,
      date ?? null,
    ] as const,
  child: (childId: string, before?: string, limit?: number) =>
    [
      ...preschoolDailyReportKeys.all,
      "child",
      childId,
      before ?? null,
      limit ?? null,
    ] as const,
};

function search(values: Record<string, string | number | undefined>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(values))
    if (value !== undefined && value !== "") params.set(key, String(value));
  return params.toString();
}

/** A Classroom's reports; `date` is today in India when left out. */
export function preschoolDailyReportsDayQueryOptions(
  classroomId: string,
  date?: string,
) {
  return queryOptions({
    queryKey: preschoolDailyReportKeys.day(classroomId, date),
    queryFn: ({ meta }) =>
      apiJson<PreschoolClassroomDailyReports>(
        `${BASE}?${search({ classroomId, date })}`,
        {},
        meta,
      ),
  });
}

/** A Child's reports newest first; pass `nextBefore` as `before` for older ones. */
export function preschoolChildDailyReportsQueryOptions(
  childId: string,
  before?: string,
  limit?: number,
) {
  return queryOptions({
    queryKey: preschoolDailyReportKeys.child(childId, before, limit),
    queryFn: ({ meta }) =>
      apiJson<PreschoolChildDailyReports>(
        `${BASE}/children/${childId}?${search({ before, limit })}`,
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

export function savePreschoolDailyReport(
  input: SavePreschoolDailyReportInput,
): Promise<PreschoolDailyReport> {
  return post("/save", input);
}

export function applyPreschoolDailyReportToClassroom(
  input: ApplyPreschoolDailyReportInput,
): Promise<PreschoolClassroomDailyReports> {
  return post("/apply-to-classroom", input);
}

export function publishPreschoolDailyReports(input: {
  classroomId: string;
  date?: string;
  childIds?: string[];
}): Promise<PreschoolPublishDailyReportsResult> {
  return post("/publish", input);
}

export const PRESCHOOL_MEAL_LABELS: Record<Meal, string> = {
  breakfast: "Breakfast",
  snack: "Snack",
  lunch: "Lunch",
};

export const PRESCHOOL_ATE_LABELS: Record<Ate, string> = {
  all: "Ate all",
  some: "Ate some",
  none: "Did not eat",
};

export const PRESCHOOL_TOILET_LABELS: Record<ToiletKind, string> = {
  diaper_wet: "Wet diaper",
  diaper_soiled: "Soiled diaper",
  potty: "Potty",
  toilet: "Toilet",
};

export const PRESCHOOL_MOOD_LABELS: Record<Mood, string> = {
  happy: "Happy",
  calm: "Calm",
  tired: "Tired",
  fussy: "Fussy",
  unwell: "Unwell",
};
