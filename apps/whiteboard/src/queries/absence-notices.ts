import { queryOptions } from "@tanstack/react-query";

import type {
  AbsenceNoticeClassesView,
  ExpectedAbsencesView,
  FamilyAbsenceNoticeView,
  FamilyAbsenceNoticesView,
  GiveAbsenceNoticeInput,
} from "@/src/training-institute/application/absence-notice-views";

import { apiJson } from "./http";

export type {
  AbsenceNoticeClassesView,
  ExpectedAbsenceClassView,
  ExpectedAbsencesView,
  FamilyAbsenceNoticeView,
  FamilyAbsenceNoticesView,
  GiveAbsenceNoticeInput,
  PickableClassView,
  RegisterNoticeView,
} from "@/src/training-institute/application/absence-notice-views";

const BASE = "/api/training-institute/absence-notices";

function post<T>(path: string, body?: unknown): Promise<T> {
  return apiJson<T>(`${BASE}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
}

export const absenceNoticeQueries = {
  key: {
    all: ["absence-notices"] as const,
    family: ["absence-notices", "family"] as const,
    expected: ["absence-notices", "expected"] as const,
  },
  /** `sessionScope` keeps one User's cache from showing for another. */
  family: (sessionScope: string) =>
    queryOptions({
      queryKey: [...absenceNoticeQueries.key.family, "notices", sessionScope],
      queryFn: () => apiJson<FamilyAbsenceNoticesView>(BASE),
    }),
  classes: (sessionScope: string) =>
    queryOptions({
      queryKey: [...absenceNoticeQueries.key.family, "classes", sessionScope],
      queryFn: () => apiJson<AbsenceNoticeClassesView>(`${BASE}/classes`),
    }),
  expected: (sessionScope: string) =>
    queryOptions({
      queryKey: [...absenceNoticeQueries.key.expected, sessionScope],
      queryFn: () => apiJson<ExpectedAbsencesView>(`${BASE}/expected`),
    }),
};

export function giveAbsenceNotice(
  input: GiveAbsenceNoticeInput,
): Promise<{ notices: FamilyAbsenceNoticeView[] }> {
  return post("", input);
}

export function withdrawAbsenceNotice(
  id: string,
): Promise<FamilyAbsenceNoticeView> {
  return post(`/${id}/withdraw`);
}
