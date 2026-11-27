import { infiniteQueryOptions } from "@tanstack/react-query";

import type { VendorActivityPageResponse } from "@/app/api/construction/labour/_activity/activity-fields";
import type { ListConstructionLabourEmployeeActivityResponseModel } from "@/app/api/construction/labour/employees/[id]/activity/activity-models";
import type { ListConstructionProjectsProjectActivityResponseModel } from "@/app/api/construction/projects/projects/[id]/activity/activity-models";

import { apiJson } from "./http";
import { EMPLOYEES_API, EMPLOYEES_KEY } from "./employees";
import { PROJECT_ACTIVITY_KEY, PROJECTS_API } from "./projects";
import { VENDORS_API, VENDORS_KEY } from "./vendors";

export type EmployeeActivityPage =
  ListConstructionLabourEmployeeActivityResponseModel;
export type EmployeeActivityEntry = EmployeeActivityPage["items"][number];
/** A Vendor's feed: a part of the Employee feed's shapes (ADR CM-0044 §7). */
export type PersonActivityPage = VendorActivityPageResponse;
export type PersonActivityEntry = PersonActivityPage["items"][number];
export type ProjectActivityPage =
  ListConstructionProjectsProjectActivityResponseModel;
export type ProjectActivityEntry = ProjectActivityPage["items"][number];

export const EMPLOYEE_ACTIVITY_TYPES = [
  "all",
  "projects",
  "attendance",
  "check_ins",
  "profile",
] as const;
export type EmployeeActivityType = (typeof EMPLOYEE_ACTIVITY_TYPES)[number];

export const PERSON_ACTIVITY_TYPES = ["all", "projects", "check_ins"] as const;
export type PersonActivityType = (typeof PERSON_ACTIVITY_TYPES)[number];

export const PROJECT_ACTIVITY_WHO = ["all", "employees", "vendors"] as const;
export type ProjectActivityWho = (typeof PROJECT_ACTIVITY_WHO)[number];

export const PROJECT_ACTIVITY_TYPES = ["all", "team", "check_ins"] as const;
export type ProjectActivityType = (typeof PROJECT_ACTIVITY_TYPES)[number];

export type EmployeeActivityFilter = {
  type: EmployeeActivityType;
  projectId: string | null;
  /** Effective dates, inclusive, `YYYY-MM-DD`. */
  from: string | null;
  to: string | null;
};

export type PersonActivityFilter = Omit<EmployeeActivityFilter, "type"> & {
  type: PersonActivityType;
};

export type ProjectActivityFilter = {
  type: ProjectActivityType;
  who: ProjectActivityWho;
  from: string | null;
  to: string | null;
};

function withCursor(
  base: string,
  params: URLSearchParams,
  cursor: string | null,
): string {
  const query = new URLSearchParams(params);
  if (cursor != null) query.set("cursor", cursor);
  const text = query.toString();
  return text === "" ? base : `${base}?${text}`;
}

function personParams(
  filter: EmployeeActivityFilter | PersonActivityFilter,
): URLSearchParams {
  const params = new URLSearchParams();
  if (filter.type !== "all") params.set("type", filter.type);
  if (filter.projectId != null) params.set("projectId", filter.projectId);
  if (filter.from != null) params.set("from", filter.from);
  if (filter.to != null) params.set("to", filter.to);
  return params;
}

/** One person's feed, a page at a time ("Load more"). */
function personActivityQuery<Page extends { nextCursor: string | null }>(
  key: readonly string[],
  api: string,
  id: string,
  filter: EmployeeActivityFilter | PersonActivityFilter,
) {
  const params = personParams(filter);
  const base = `${api}/${encodeURIComponent(id)}/activity`;
  return infiniteQueryOptions({
    queryKey: [...key, "activity", id, params.toString()],
    initialPageParam: null as string | null,
    queryFn: ({ pageParam, meta }) =>
      apiJson<Page>(withCursor(base, params, pageParam), undefined, meta),
    getNextPageParam: (last) => last.nextCursor,
  });
}

/** An Employee's Activity (ADR CM-0055). */
export function employeeActivityQuery(
  id: string,
  filter: EmployeeActivityFilter,
) {
  return personActivityQuery<EmployeeActivityPage>(
    EMPLOYEES_KEY,
    EMPLOYEES_API,
    id,
    filter,
  );
}

/** A Vendor's Activity (ADR CM-0044 §7). */
export function vendorActivityQuery(id: string, filter: PersonActivityFilter) {
  return personActivityQuery<PersonActivityPage>(
    VENDORS_KEY,
    VENDORS_API,
    id,
    filter,
  );
}

/** A Project's Activity, a page at a time ("Load more"). */
export function projectActivityQuery(
  id: string,
  filter: ProjectActivityFilter,
) {
  const params = new URLSearchParams();
  if (filter.type !== "all") params.set("type", filter.type);
  if (filter.who !== "all") params.set("who", filter.who);
  if (filter.from != null) params.set("from", filter.from);
  if (filter.to != null) params.set("to", filter.to);
  const base = `${PROJECTS_API}/${encodeURIComponent(id)}/activity`;
  return infiniteQueryOptions({
    queryKey: [...PROJECT_ACTIVITY_KEY, id, params.toString()],
    initialPageParam: null as string | null,
    queryFn: ({ pageParam, meta }) =>
      apiJson<ProjectActivityPage>(
        withCursor(base, params, pageParam),
        undefined,
        meta,
      ),
    getNextPageParam: (last) => last.nextCursor,
  });
}
