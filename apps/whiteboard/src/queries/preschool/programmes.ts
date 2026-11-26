import { queryOptions } from "@tanstack/react-query";

import type {
  ProgrammeListView,
  ProgrammeView,
} from "@/src/preschool/application/programme-views";

import { apiJson } from "../http";
import { preschoolKeys } from "./me";

export type PreschoolProgramme = ProgrammeView;
export type PreschoolProgrammeList = ProgrammeListView;

/** Ages are completed months on the first day of the Academic Year; null is no limit. */
export type PreschoolProgrammeInput = {
  name: string;
  minAgeMonths?: number | null;
  maxAgeMonths?: number | null;
  isDaycare?: boolean;
};

const BASE = "/api/preschool/programmes";

function post<T>(path: string, body: unknown = {}): Promise<T> {
  return apiJson<T>(`${BASE}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

export const programmeKeys = {
  all: [...preschoolKeys.all, "programmes"] as const,
  list: (includeArchived: boolean) =>
    [...programmeKeys.all, "list", { includeArchived }] as const,
};

/** Programmes in display order; archived ones only when asked for. */
export function programmesQueryOptions(options?: {
  includeArchived?: boolean;
}) {
  const includeArchived = options?.includeArchived ?? false;
  return queryOptions({
    queryKey: programmeKeys.list(includeArchived),
    queryFn: ({ meta }) =>
      apiJson<ProgrammeListView>(
        `${BASE}?includeArchived=${String(includeArchived)}`,
        {},
        meta,
      ),
  });
}

export function createProgramme(
  body: PreschoolProgrammeInput,
): Promise<ProgrammeView> {
  return post<ProgrammeView>("", body);
}

export function updateProgrammeDetails(
  id: string,
  body: PreschoolProgrammeInput,
): Promise<ProgrammeView> {
  return post<ProgrammeView>(`/${id}/details`, body);
}

export function archiveProgramme(id: string): Promise<ProgrammeView> {
  return post<ProgrammeView>(`/${id}/archive`);
}

export function restoreProgramme(id: string): Promise<ProgrammeView> {
  return post<ProgrammeView>(`/${id}/restore`);
}

/** `programmeIds`: every Programme that is not archived, in the new order. */
export function reorderProgrammes(
  programmeIds: readonly string[],
): Promise<ProgrammeListView> {
  return post<ProgrammeListView>("/reorder", { programmeIds });
}
