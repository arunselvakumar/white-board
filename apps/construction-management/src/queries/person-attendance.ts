import { infiniteQueryOptions } from "@tanstack/react-query";

import type { ConstructionPersonAttendanceResponseModel } from "@/app/api/_lib/person-attendance-models";

import { apiJson } from "./http";
import { LABOURS_API, LABOURS_KEY } from "./labours";
import { SITE_ENGINEERS_KEY } from "./site-engineers";
import { VENDORS_API, VENDORS_KEY } from "./vendors";

/** One page of a person's Attendance tab (ADR CM-0051). */
export type PersonAttendancePage = ConstructionPersonAttendanceResponseModel;
export type PersonAttendanceDay =
  PersonAttendancePage["months"][number]["days"][number];
export type PersonAttendancePlace = PersonAttendanceDay["places"][number];
export type PersonAttendanceAllTime = NonNullable<
  PersonAttendancePage["allTime"]
>;

/**
 * A person's Attendance, six months a page, newest first: the first page
 * ends this month and carries the all-time figures; each next page ends
 * the month before the last one began (`earlierTo`).
 */
function personAttendanceQuery(
  key: readonly string[],
  api: string,
  id: string,
) {
  const base = `${api}/${encodeURIComponent(id)}/attendance`;
  return infiniteQueryOptions({
    queryKey: [...key, "attendance", id],
    initialPageParam: null as string | null,
    queryFn: ({ pageParam, meta }) =>
      apiJson<PersonAttendancePage>(
        pageParam == null ? base : `${base}?to=${pageParam}`,
        undefined,
        meta,
      ),
    getNextPageParam: (last) => last.earlierTo,
  });
}

export function labourAttendanceQuery(id: string) {
  return personAttendanceQuery(LABOURS_KEY, LABOURS_API, id);
}

export function siteEngineerAttendanceQuery(id: string) {
  return personAttendanceQuery(
    SITE_ENGINEERS_KEY,
    "/api/construction/masters/site-engineers",
    id,
  );
}

export function vendorAttendanceQuery(id: string) {
  return personAttendanceQuery(VENDORS_KEY, VENDORS_API, id);
}

export function teamMemberAttendanceQuery(id: string) {
  return personAttendanceQuery(
    ["organization", "team-members"],
    "/api/construction/organization/team-members",
    id,
  );
}

/** Any of the four: what the tab's component takes. */
export type PersonAttendanceQuery = ReturnType<typeof labourAttendanceQuery>;
