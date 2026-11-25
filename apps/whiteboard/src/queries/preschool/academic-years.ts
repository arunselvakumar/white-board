import { queryOptions } from "@tanstack/react-query";

import type {
  AcademicYearListView,
  AcademicYearView,
} from "@/src/preschool/application/academic-year-views";

import { apiJson } from "../http";
import { preschoolKeys } from "./me";

export type PreschoolAcademicYear = AcademicYearView;
export type PreschoolAcademicYearList = AcademicYearListView;

const BASE = "/api/preschool/academic-years";

export const academicYearKeys = {
  all: [...preschoolKeys.all, "academic-years"] as const,
  list: () => [...academicYearKeys.all, "list"] as const,
};

/** Every Academic Year, newest first. */
export function academicYearsQueryOptions() {
  return queryOptions({
    queryKey: academicYearKeys.list(),
    queryFn: ({ meta }) => apiJson<AcademicYearListView>(BASE, {}, meta),
  });
}

/** Adds the year after the latest one (Owner). */
export function createNextAcademicYear(): Promise<AcademicYearView> {
  return apiJson<AcademicYearView>(BASE, { method: "POST" });
}

export function makeAcademicYearCurrent(id: string): Promise<AcademicYearView> {
  return apiJson<AcademicYearView>(`${BASE}/${id}/make-current`, {
    method: "POST",
  });
}
