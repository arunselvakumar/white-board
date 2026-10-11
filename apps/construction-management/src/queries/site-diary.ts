import {
  queryOptions,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import type { z } from "zod";

import type {
  ConstructionSiteWorkSiteDiaryResponse,
  CreateConstructionSiteWorkSiteDiaryRequestModel,
  GetConstructionSiteWorkSiteDiaryByDateResponse,
  ListConstructionSiteWorkSiteDiariesResponse,
  UpdateConstructionSiteWorkSiteDiaryRequestModel,
} from "@/app/api/construction/site-work/site-diary/site-diary-models";

import { apiJson } from "./http";
import { SITE_WORK_API, SITE_WORK_KEY } from "./site-work-access";

export type SiteDiary = ConstructionSiteWorkSiteDiaryResponse;
export type SiteDiaryOnDate = GetConstructionSiteWorkSiteDiaryByDateResponse;
export type SiteDiaryDays = ListConstructionSiteWorkSiteDiariesResponse;
export type CreateSiteDiaryInput = z.input<
  typeof CreateConstructionSiteWorkSiteDiaryRequestModel
>;
export type UpdateSiteDiaryInput = z.input<
  typeof UpdateConstructionSiteWorkSiteDiaryRequestModel
>;

export const SITE_DIARY_API = `${SITE_WORK_API}/site-diary`;
/** Every Site Diary read; writes invalidate it (CM-607). */
export const SITE_DIARY_KEY = [...SITE_WORK_KEY, "site-diary"] as const;

/** The Project's diary for a date, or `diary: null`. */
export function siteDiaryOnDateQuery(projectId: string, date: string) {
  const params = new URLSearchParams({ projectId, date });
  return queryOptions({
    queryKey: [...SITE_DIARY_KEY, "on", projectId, date],
    queryFn: () =>
      apiJson<SiteDiaryOnDate>(`${SITE_DIARY_API}/by-date?${params}`),
  });
}

/** The dates in `from`–`to` that have a diary, newest first. */
export function siteDiaryDaysQuery(
  projectId: string,
  from: string,
  to: string,
) {
  const params = new URLSearchParams({ projectId, from, to });
  return queryOptions({
    queryKey: [...SITE_DIARY_KEY, "days", projectId, from, to],
    queryFn: () => apiJson<SiteDiaryDays>(`${SITE_DIARY_API}?${params}`),
  });
}

export function siteDiaryQuery(id: string) {
  return queryOptions({
    queryKey: [...SITE_DIARY_KEY, "detail", id],
    queryFn: () =>
      apiJson<SiteDiary>(`${SITE_DIARY_API}/${encodeURIComponent(id)}`),
  });
}

function post<T>(path: string, body: unknown): Promise<T> {
  return apiJson<T>(`${SITE_DIARY_API}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function useInvalidate() {
  const client = useQueryClient();
  return () => client.invalidateQueries({ queryKey: SITE_DIARY_KEY });
}

export function useCreateSiteDiary() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (input: CreateSiteDiaryInput) => post<SiteDiary>("", input),
    onSuccess: invalidate,
  });
}

export function useUpdateSiteDiary(id: string) {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (input: UpdateSiteDiaryInput) =>
      post<SiteDiary>(`/${encodeURIComponent(id)}/update`, input),
    onSuccess: invalidate,
  });
}

export function useDeleteSiteDiary(id: string) {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (expectedUpdatedAt: string) =>
      post<undefined>(`/${encodeURIComponent(id)}/delete`, {
        expectedUpdatedAt,
      }),
    onSuccess: invalidate,
  });
}

/** The Project's Site Diary page, on a date when given. */
export function siteDiaryPath(projectId: string, date?: string): string {
  const base = `/app/projects/${encodeURIComponent(projectId)}/site-diary`;
  return date == null ? base : `${base}?date=${encodeURIComponent(date)}`;
}
