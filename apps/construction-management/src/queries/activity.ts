import { infiniteQueryOptions } from "@tanstack/react-query";

import type {
  ListConstructionLabourLabourActivityResponseModel,
  PersonActivityPageResponse,
} from "@/app/api/construction/labour/labours/[id]/activity/activity-models";
import type { ListConstructionProjectsProjectActivityResponseModel } from "@/app/api/construction/projects/projects/[id]/activity/activity-models";

import { apiJson } from "./http";
import { LABOURS_API, LABOURS_KEY } from "./labours";
import { PROJECT_ACTIVITY_KEY, PROJECTS_API } from "./projects";
import { SITE_ENGINEERS_KEY } from "./site-engineers";
import { VENDORS_API, VENDORS_KEY } from "./vendors";

export type LabourActivityPage =
  ListConstructionLabourLabourActivityResponseModel;
export type LabourActivityEntry = LabourActivityPage["items"][number];
/** A Site Engineer's or a Vendor's feed: the Labour feed's shapes (ADR CM-0044 §7). */
export type PersonActivityPage = PersonActivityPageResponse;
export type PersonActivityEntry = PersonActivityPage["items"][number];
export type ProjectActivityPage =
  ListConstructionProjectsProjectActivityResponseModel;
export type ProjectActivityEntry = ProjectActivityPage["items"][number];

export const LABOUR_ACTIVITY_TYPES = [
  "all",
  "projects",
  "attendance",
  "check_ins",
  "profile",
] as const;
export type LabourActivityType = (typeof LABOUR_ACTIVITY_TYPES)[number];

export const PERSON_ACTIVITY_TYPES = ["all", "projects", "check_ins"] as const;
export type PersonActivityType = (typeof PERSON_ACTIVITY_TYPES)[number];

export const PROJECT_ACTIVITY_WHO = [
  "all",
  "site_engineers",
  "labours",
  "vendors",
] as const;
export type ProjectActivityWho = (typeof PROJECT_ACTIVITY_WHO)[number];

export const PROJECT_ACTIVITY_TYPES = ["all", "team", "check_ins"] as const;
export type ProjectActivityType = (typeof PROJECT_ACTIVITY_TYPES)[number];

export type LabourActivityFilter = {
  type: LabourActivityType;
  projectId: string | null;
  /** Effective dates, inclusive, `YYYY-MM-DD`. */
  from: string | null;
  to: string | null;
};

export type PersonActivityFilter = Omit<LabourActivityFilter, "type"> & {
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
  filter: LabourActivityFilter | PersonActivityFilter,
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
  filter: LabourActivityFilter | PersonActivityFilter,
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

/** A Labour's Activity. */
export function labourActivityQuery(id: string, filter: LabourActivityFilter) {
  return personActivityQuery<LabourActivityPage>(
    LABOURS_KEY,
    LABOURS_API,
    id,
    filter,
  );
}

const SITE_ENGINEERS_API = "/api/construction/masters/site-engineers";

/** A Site Engineer's Activity (ADR CM-0044 §7). */
export function siteEngineerActivityQuery(
  id: string,
  filter: PersonActivityFilter,
) {
  return personActivityQuery<PersonActivityPage>(
    SITE_ENGINEERS_KEY,
    SITE_ENGINEERS_API,
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
