import { queryOptions } from "@tanstack/react-query";

import type {
  DomainInput,
  ListObservationsInput,
  ObservationInput,
} from "@/src/preschool/application/observation-handlers";
import type {
  DevelopmentDomainView,
  ObservationPageView,
  ObservationView,
} from "@/src/preschool/application/observation-views";

import { apiJson } from "../http";
import { preschoolKeys } from "./me";

export type PreschoolDevelopmentDomain = DevelopmentDomainView;
export type PreschoolObservation = ObservationView;
export type PreschoolObservationPage = ObservationPageView;
export type PreschoolObservationFilters = ListObservationsInput;
export type CreatePreschoolObservationInput = ObservationInput;
export type PreschoolDomainInput = DomainInput;

const BASE = "/api/preschool/observations";

export const preschoolObservationKeys = {
  all: [...preschoolKeys.all, "observations"] as const,
  domains: (includeArchived = false) =>
    [...preschoolObservationKeys.all, "domains", includeArchived] as const,
  list: (filters: PreschoolObservationFilters) =>
    [...preschoolObservationKeys.all, "list", filters] as const,
};

function search(values: Record<string, string | number | undefined>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(values))
    if (value !== undefined && value !== "") params.set(key, String(value));
  return params.toString();
}

/** In order; the Owner may ask for archived ones too. */
export function preschoolDomainsQueryOptions(includeArchived = false) {
  return queryOptions({
    queryKey: preschoolObservationKeys.domains(includeArchived),
    queryFn: ({ meta }) =>
      apiJson<{ items: PreschoolDevelopmentDomain[] }>(
        `${BASE}/domains?${search({ includeArchived: includeArchived ? "true" : undefined })}`,
        {},
        meta,
      ),
  });
}

/** One Child's (`childId`) or one Classroom's (`classroomId`) Observations. */
export function preschoolObservationsQueryOptions(
  filters: PreschoolObservationFilters,
) {
  return queryOptions({
    queryKey: preschoolObservationKeys.list(filters),
    queryFn: ({ meta }) =>
      apiJson<PreschoolObservationPage>(`${BASE}?${search(filters)}`, {}, meta),
  });
}

function post<T>(path: string, body: unknown = {}): Promise<T> {
  return apiJson<T>(`${BASE}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

export function createPreschoolObservation(
  input: CreatePreschoolObservationInput,
): Promise<PreschoolObservation> {
  return post("", input);
}

export function updatePreschoolObservation(
  id: string,
  input: { domainId: string; observedOn: string; note: string },
): Promise<PreschoolObservation> {
  return post(`/${id}/details`, input);
}

export function removePreschoolObservation(id: string): Promise<void> {
  return post(`/${id}/remove`);
}

export function createPreschoolDomain(
  input: PreschoolDomainInput,
): Promise<PreschoolDevelopmentDomain> {
  return post("/domains", input);
}

export function renamePreschoolDomain(
  id: string,
  input: PreschoolDomainInput,
): Promise<PreschoolDevelopmentDomain> {
  return post(`/domains/${id}/details`, input);
}

export function archivePreschoolDomain(
  id: string,
): Promise<PreschoolDevelopmentDomain> {
  return post(`/domains/${id}/archive`);
}

export function restorePreschoolDomain(
  id: string,
): Promise<PreschoolDevelopmentDomain> {
  return post(`/domains/${id}/restore`);
}
