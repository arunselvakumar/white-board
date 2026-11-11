import { infiniteQueryOptions } from "@tanstack/react-query";

import type { ListConstructionLabourLabourActivityResponseModel } from "@/app/api/construction/labour/labours/[id]/activity/activity-models";
import type { ListConstructionProjectsProjectActivityResponseModel } from "@/app/api/construction/projects/projects/[id]/activity/activity-models";

import { apiJson } from "./http";
import { LABOURS_API, LABOURS_KEY } from "./labours";
import { PROJECTS_API, PROJECTS_KEY } from "./projects";

export type LabourActivityPage =
  ListConstructionLabourLabourActivityResponseModel;
export type LabourActivityEntry = LabourActivityPage["items"][number];
export type ProjectActivityPage =
  ListConstructionProjectsProjectActivityResponseModel;
export type ProjectActivityEntry = ProjectActivityPage["items"][number];

export const LABOUR_ACTIVITY_TYPES = [
  "all",
  "projects",
  "attendance",
  "profile",
] as const;
export type LabourActivityType = (typeof LABOUR_ACTIVITY_TYPES)[number];

export const PROJECT_ACTIVITY_WHO = [
  "all",
  "site_engineers",
  "labours",
] as const;
export type ProjectActivityWho = (typeof PROJECT_ACTIVITY_WHO)[number];

export type LabourActivityFilter = {
  type: LabourActivityType;
  projectId: string | null;
  /** Effective dates, inclusive, `YYYY-MM-DD`. */
  from: string | null;
  to: string | null;
};

export type ProjectActivityFilter = {
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

/** A Labour's Activity, a page at a time ("Load more"). */
export function labourActivityQuery(id: string, filter: LabourActivityFilter) {
  const params = new URLSearchParams();
  if (filter.type !== "all") params.set("type", filter.type);
  if (filter.projectId != null) params.set("projectId", filter.projectId);
  if (filter.from != null) params.set("from", filter.from);
  if (filter.to != null) params.set("to", filter.to);
  const base = `${LABOURS_API}/${encodeURIComponent(id)}/activity`;
  return infiniteQueryOptions({
    queryKey: [...LABOURS_KEY, "activity", id, params.toString()],
    initialPageParam: null as string | null,
    queryFn: ({ pageParam, meta }) =>
      apiJson<LabourActivityPage>(
        withCursor(base, params, pageParam),
        undefined,
        meta,
      ),
    getNextPageParam: (last) => last.nextCursor,
  });
}

/** A Project's Activity, a page at a time ("Load more"). */
export function projectActivityQuery(
  id: string,
  filter: ProjectActivityFilter,
) {
  const params = new URLSearchParams();
  if (filter.who !== "all") params.set("who", filter.who);
  if (filter.from != null) params.set("from", filter.from);
  if (filter.to != null) params.set("to", filter.to);
  const base = `${PROJECTS_API}/${encodeURIComponent(id)}/activity`;
  return infiniteQueryOptions({
    queryKey: [...PROJECTS_KEY, "activity", id, params.toString()],
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
