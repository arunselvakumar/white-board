import { queryOptions } from "@tanstack/react-query";

import type {
  ClassroomDetailView,
  ClassroomListView,
  ClassroomOptionsView,
  ClassroomView,
} from "@/src/preschool/application/classroom-views";

import { apiJson } from "../http";
import { preschoolKeys } from "./me";

export type PreschoolClassroom = ClassroomView;
export type PreschoolClassroomList = ClassroomListView;
export type PreschoolClassroomDetail = ClassroomDetailView;
export type PreschoolClassroomOptions = ClassroomOptionsView;

export type CreatePreschoolClassroomInput = {
  centreId: string;
  programmeId: string;
  name: string;
  capacity: number;
  /** Defaults to the current Academic Year. */
  academicYearId?: string;
};

export type UpdatePreschoolClassroomInput = { name: string; capacity: number };

const BASE = "/api/preschool/classrooms";

function post<T>(path: string, body: unknown = {}): Promise<T> {
  return apiJson<T>(`${BASE}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

export const classroomKeys = {
  all: [...preschoolKeys.all, "classrooms"] as const,
  list: (centreId: string, academicYearId?: string) =>
    [
      ...classroomKeys.all,
      "list",
      centreId,
      academicYearId ?? "current",
    ] as const,
  detail: (id: string) => [...classroomKeys.all, "detail", id] as const,
  options: (centreId: string) =>
    [...classroomKeys.all, "options", centreId] as const,
};

/** A Centre's Classrooms for a year (the current one by default). */
export function classroomsQueryOptions(
  centreId: string,
  academicYearId?: string,
) {
  const params = new URLSearchParams({ centreId });
  if (academicYearId != null) params.set("academicYearId", academicYearId);
  return queryOptions({
    queryKey: classroomKeys.list(centreId, academicYearId),
    queryFn: ({ meta }) =>
      apiJson<ClassroomListView>(`${BASE}?${params.toString()}`, {}, meta),
  });
}

/** A Classroom with its roster. */
export function classroomQueryOptions(id: string) {
  return queryOptions({
    queryKey: classroomKeys.detail(id),
    queryFn: ({ meta }) =>
      apiJson<ClassroomDetailView>(`${BASE}/${id}`, {}, meta),
  });
}

/** Programmes and this year's Classrooms of a Centre, for forms. */
export function classroomOptionsQueryOptions(centreId: string) {
  return queryOptions({
    queryKey: classroomKeys.options(centreId),
    queryFn: ({ meta }) =>
      apiJson<ClassroomOptionsView>(
        `${BASE}/options?${new URLSearchParams({ centreId }).toString()}`,
        {},
        meta,
      ),
  });
}

export function createClassroom(
  body: CreatePreschoolClassroomInput,
): Promise<ClassroomView> {
  return post<ClassroomView>("", body);
}

export function updateClassroomDetails(
  id: string,
  body: UpdatePreschoolClassroomInput,
): Promise<ClassroomView> {
  return post<ClassroomView>(`/${id}/details`, body);
}

export function archiveClassroom(id: string): Promise<ClassroomView> {
  return post<ClassroomView>(`/${id}/archive`);
}

/** Replaces the Class Teachers; an empty list removes them all. */
export function setClassTeachers(
  id: string,
  staffIds: readonly string[],
): Promise<ClassroomView> {
  return post<ClassroomView>(`/${id}/teachers`, { staffIds });
}
