import {
  queryOptions,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import type { z } from "zod";

import type {
  CloseConstructionSiteWorkHindranceRequestModel,
  ConstructionSiteWorkHindranceResponse,
  CreateConstructionSiteWorkHindranceRequestModel,
  GetConstructionSiteWorkHindranceFormOptionsResponse,
  ListConstructionSiteWorkHindrancesResponse,
  UpdateConstructionSiteWorkHindranceRequestModel,
} from "@/app/api/construction/site-work/hindrances/hindrance-models";
import type {
  HindranceCause,
  HindranceStatus,
  ResponsibleParty,
} from "@/src/site-work/domain/hindrance";

import { apiJson } from "./http";
import { SITE_WORK_API, SITE_WORK_KEY } from "./site-work-access";

export type Hindrance = ConstructionSiteWorkHindranceResponse;
export type HindrancePage = ListConstructionSiteWorkHindrancesResponse;
export type HindranceFormOptions =
  GetConstructionSiteWorkHindranceFormOptionsResponse;
export type CreateHindranceInput = z.input<
  typeof CreateConstructionSiteWorkHindranceRequestModel
>;
export type UpdateHindranceInput = z.input<
  typeof UpdateConstructionSiteWorkHindranceRequestModel
>;
export type CloseHindranceInput = z.input<
  typeof CloseConstructionSiteWorkHindranceRequestModel
>;

export const HINDRANCES_API = `${SITE_WORK_API}/hindrances`;
/** Every Hindrance register read; writes invalidate it (CM-607). */
export const HINDRANCES_KEY = [...SITE_WORK_KEY, "hindrances"] as const;

export type HindranceFilters = {
  status?: HindranceStatus | null;
  cause?: HindranceCause | null;
  responsibleParty?: ResponsibleParty | null;
  contractorId?: string | null;
  from?: string;
  to?: string;
  search?: string;
  cursor?: { after?: string; before?: string } | null;
};

/** A Project's hindrances, newest first. */
export function hindrancesQuery(
  projectId: string,
  filters: HindranceFilters = {},
) {
  const params = new URLSearchParams({ projectId, limit: "25" });
  if (filters.status != null) params.set("status", filters.status);
  if (filters.cause != null) params.set("cause", filters.cause);
  if (filters.responsibleParty != null)
    params.set("responsibleParty", filters.responsibleParty);
  if (filters.contractorId != null)
    params.set("contractorId", filters.contractorId);
  if (filters.from != null && filters.from !== "")
    params.set("from", filters.from);
  if (filters.to != null && filters.to !== "") params.set("to", filters.to);
  const search = filters.search?.trim() ?? "";
  if (search !== "") params.set("search", search);
  if (filters.cursor?.after != null) params.set("after", filters.cursor.after);
  if (filters.cursor?.before != null)
    params.set("before", filters.cursor.before);
  return queryOptions({
    queryKey: [...HINDRANCES_KEY, "list", params.toString()],
    queryFn: () => apiJson<HindrancePage>(`${HINDRANCES_API}?${params}`),
  });
}

export function hindranceQuery(id: string) {
  return queryOptions({
    queryKey: [...HINDRANCES_KEY, "detail", id],
    queryFn: () =>
      apiJson<Hindrance>(`${HINDRANCES_API}/${encodeURIComponent(id)}`),
  });
}

/** Contractors on the Project and who may sign off. */
export function hindranceFormOptionsQuery(projectId: string) {
  const params = new URLSearchParams({ projectId });
  return queryOptions({
    queryKey: [...HINDRANCES_KEY, "form-options", projectId],
    queryFn: () =>
      apiJson<HindranceFormOptions>(`${HINDRANCES_API}/form-options?${params}`),
    staleTime: 60_000,
  });
}

function post<T>(path: string, body: unknown): Promise<T> {
  return apiJson<T>(`${HINDRANCES_API}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function useInvalidate() {
  const client = useQueryClient();
  return () => client.invalidateQueries({ queryKey: HINDRANCES_KEY });
}

export function useCreateHindrance() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (input: CreateHindranceInput) => post<Hindrance>("", input),
    onSuccess: invalidate,
  });
}

export function useUpdateHindrance(id: string) {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (input: UpdateHindranceInput) =>
      post<Hindrance>(`/${encodeURIComponent(id)}/update`, input),
    onSuccess: invalidate,
  });
}

export function useCloseHindrance(id: string) {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (input: CloseHindranceInput) =>
      post<Hindrance>(`/${encodeURIComponent(id)}/close`, input),
    onSuccess: invalidate,
  });
}

export function useDeleteHindrance(id: string) {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (expectedUpdatedAt: string) =>
      post<undefined>(`/${encodeURIComponent(id)}/delete`, {
        expectedUpdatedAt,
      }),
    onSuccess: invalidate,
  });
}

/** Pages of a Project's Hindrance register. */
export function hindrancesPath(projectId: string, id?: string): string {
  const base = `/app/projects/${encodeURIComponent(projectId)}/hindrances`;
  return id == null ? base : `${base}/${encodeURIComponent(id)}`;
}

/**
 * **Record hindrance** from an Equipment Usage sheet (CM-0016 §14): the new
 * form prefilled with Equipment breakdown, the sheet's date, the sheet and
 * an activity.
 */
export function newHindranceFromUsageSheetPath(
  projectId: string,
  sheet: { id: string; date: string; activity?: string | null },
): string {
  const params = new URLSearchParams({
    cause: "equipment_breakdown",
    date: sheet.date,
    equipmentUsageSheetId: sheet.id,
  });
  if (sheet.activity != null && sheet.activity !== "")
    params.set("activity", sheet.activity);
  return `${hindrancesPath(projectId)}/new?${params}`;
}
