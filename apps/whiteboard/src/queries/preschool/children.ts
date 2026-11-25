import { queryOptions } from "@tanstack/react-query";

import type {
  AdmitChildInput,
  ListChildrenInput,
  ReplacePickupsInput,
  UpdateChildHealthInput,
  UpdateChildParentsInput,
  UpdateChildProfileInput,
} from "@/src/preschool/application/child-handlers";
import type {
  AdmissionView,
  AdmitChildView,
  ChildFormOptionsView,
  ChildListItemView,
  ChildPageView,
  ChildProfileView,
} from "@/src/preschool/application/child-views";
import type { ChildStatus } from "@/src/preschool/domain/child";

import { apiJson } from "../http";
import { preschoolKeys } from "./me";

export type PreschoolChild = ChildListItemView;
export type PreschoolChildPage = ChildPageView;
export type PreschoolChildProfile = ChildProfileView;
export type PreschoolAdmission = AdmissionView;
export type PreschoolAdmitChildResult = AdmitChildView;
export type PreschoolChildFormOptions = ChildFormOptionsView;
export type PreschoolChildStatus = ChildStatus;
export type PreschoolChildFilters = ListChildrenInput;
export type AdmitPreschoolChildInput = AdmitChildInput;
export type UpdatePreschoolChildProfileInput = UpdateChildProfileInput;
export type UpdatePreschoolChildParentsInput = UpdateChildParentsInput;
export type UpdatePreschoolChildHealthInput = UpdateChildHealthInput;
export type ReplacePreschoolChildPickupsInput = ReplacePickupsInput;

const BASE = "/api/preschool/children";

export const preschoolChildKeys = {
  all: [...preschoolKeys.all, "children"] as const,
  list: (filters: PreschoolChildFilters) =>
    [...preschoolChildKeys.all, "list", filters] as const,
  detail: (id: string) => [...preschoolChildKeys.all, "detail", id] as const,
  options: (centreId: string) =>
    [...preschoolChildKeys.all, "options", centreId] as const,
};

function search(values: Record<string, string | number | undefined>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(values))
    if (value !== undefined && value !== "") params.set(key, String(value));
  return params.toString();
}

export function preschoolChildrenQueryOptions(filters: PreschoolChildFilters) {
  return queryOptions({
    queryKey: preschoolChildKeys.list(filters),
    queryFn: ({ meta }) =>
      apiJson<PreschoolChildPage>(`${BASE}?${search(filters)}`, {}, meta),
  });
}

export function preschoolChildQueryOptions(id: string) {
  return queryOptions({
    queryKey: preschoolChildKeys.detail(id),
    queryFn: ({ meta }) =>
      apiJson<PreschoolChildProfile>(`${BASE}/${id}`, {}, meta),
  });
}

export function preschoolChildFormOptionsQueryOptions(centreId: string) {
  return queryOptions({
    queryKey: preschoolChildKeys.options(centreId),
    queryFn: ({ meta }) =>
      apiJson<PreschoolChildFormOptions>(
        `${BASE}/options?${search({ centreId })}`,
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

export function admitPreschoolChild(
  input: AdmitPreschoolChildInput,
): Promise<PreschoolAdmitChildResult> {
  return post("", input);
}

export function updatePreschoolChildProfile(
  id: string,
  input: UpdatePreschoolChildProfileInput,
): Promise<PreschoolChildProfile> {
  return post(`/${id}/profile`, input);
}

export function updatePreschoolChildParents(
  id: string,
  input: UpdatePreschoolChildParentsInput,
): Promise<PreschoolChildProfile> {
  return post(`/${id}/parents`, input);
}

export function updatePreschoolChildHealth(
  id: string,
  input: UpdatePreschoolChildHealthInput,
): Promise<PreschoolChildProfile> {
  return post(`/${id}/health`, input);
}

export function replacePreschoolChildPickups(
  id: string,
  input: ReplacePreschoolChildPickupsInput,
): Promise<PreschoolChildProfile> {
  return post(`/${id}/pickups`, input);
}

export function movePreschoolChildClassroom(
  id: string,
  input: { classroomId: string; movedOn?: string },
): Promise<PreschoolChildProfile> {
  return post(`/${id}/move-classroom`, input);
}

export function promotePreschoolChild(
  id: string,
  input: {
    programmeId: string;
    classroomId: string;
    academicYearId?: string;
    admittedOn?: string;
  },
): Promise<PreschoolAdmitChildResult> {
  return post(`/${id}/promote`, input);
}

export function withdrawPreschoolChild(
  id: string,
  input: { withdrawnOn: string; reason: string },
): Promise<PreschoolChildProfile> {
  return post(`/${id}/withdraw`, input);
}

export const PRESCHOOL_CHILD_STATUS_LABELS: Record<ChildStatus, string> = {
  active: "Active",
  withdrawn: "Withdrawn",
  graduated: "Graduated",
};

export { BLOOD_GROUPS as PRESCHOOL_BLOOD_GROUPS } from "@/src/preschool/domain/child";
