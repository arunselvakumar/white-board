import { infiniteQueryOptions, queryOptions } from "@tanstack/react-query";

import type { FamilyAnnouncementsView } from "@/src/preschool/application/announcement-views";
import type { ChildDailyReportsView } from "@/src/preschool/application/daily-report-views";
import type { FamilyHomeView } from "@/src/preschool/application/family-views";

import { apiJson } from "../http";
import { preschoolKeys } from "./me";

export type PreschoolFamilyHome = FamilyHomeView;
export type PreschoolFamilyChild = FamilyHomeView["children"][number];

export const preschoolFamilyKeys = {
  all: [...preschoolKeys.all, "family"] as const,
  home: () => [...preschoolFamilyKeys.all, "home"] as const,
  reports: (childId: string) =>
    [...preschoolFamilyKeys.all, "reports", childId] as const,
  announcements: () => [...preschoolFamilyKeys.all, "announcements"] as const,
};

/** The Parent Home: every one of the Parent's Children. */
export function preschoolFamilyHomeQueryOptions() {
  return queryOptions({
    queryKey: preschoolFamilyKeys.home(),
    queryFn: ({ meta }) =>
      apiJson<PreschoolFamilyHome>("/api/preschool/family/home", {}, meta),
  });
}

/** A Child's published Daily Reports, newest first, a page at a time. */
export function preschoolFamilyReportsInfiniteOptions(childId: string) {
  return infiniteQueryOptions({
    queryKey: preschoolFamilyKeys.reports(childId),
    initialPageParam: null as string | null,
    queryFn: ({ pageParam, meta }) =>
      apiJson<ChildDailyReportsView>(
        `/api/preschool/daily-reports/children/${encodeURIComponent(childId)}${
          pageParam == null ? "" : `?before=${pageParam}`
        }`,
        {},
        meta,
      ),
    getNextPageParam: (page) => page.nextBefore,
  });
}

/** What reaches the Parent's Children, newest first, a page at a time; each page repeats what is coming up. */
export function preschoolFamilyAnnouncementsInfiniteOptions() {
  return infiniteQueryOptions({
    queryKey: preschoolFamilyKeys.announcements(),
    initialPageParam: null as string | null,
    queryFn: ({ pageParam, meta }) =>
      apiJson<FamilyAnnouncementsView>(
        `/api/preschool/announcements/family${
          pageParam == null ? "" : `?cursor=${encodeURIComponent(pageParam)}`
        }`,
        {},
        meta,
      ),
    getNextPageParam: (page) => page.nextCursor,
  });
}
