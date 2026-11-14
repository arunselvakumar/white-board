import {
  infiniteQueryOptions,
  queryOptions,
  useMutation,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";

import {
  CHECK_INS_PATH,
  type ConstructionLabourCheckInEntryResponseModel,
  type ConstructionLabourCheckInPersonResponseModel,
  type GetConstructionLabourCheckInPersonResponseModel,
  type ListConstructionLabourCheckInEntriesResponseModel,
  type ListConstructionLabourCheckInPeopleResponseModel,
  type RecordConstructionLabourCheckInRequestModel,
  type RecordConstructionLabourCheckInResponseModel,
  type VoidConstructionLabourCheckInResponseModel,
} from "@/app/api/construction/labour/attendance/check-ins/check-in-models";

import { apiJson, QueryHttpError } from "./http";
import { LABOUR_ATTENDANCE_KEY } from "./labour-attendance";

export { CHECK_INS_PATH };

export type CheckInPeople = ListConstructionLabourCheckInPeopleResponseModel;
export type CheckInPerson = ConstructionLabourCheckInPersonResponseModel;
export type CheckInPersonView = GetConstructionLabourCheckInPersonResponseModel;
export type CheckInEntry = ConstructionLabourCheckInEntryResponseModel;
export type CheckInLogPage = ListConstructionLabourCheckInEntriesResponseModel;
export type CheckInKind = CheckInPerson["kind"];
export type CheckInAction = CheckInEntry["action"];
export type RecordCheckInInput = RecordConstructionLabourCheckInRequestModel;
export type RecordCheckInResult = RecordConstructionLabourCheckInResponseModel;
export type VoidCheckInResult = VoidConstructionLabourCheckInResponseModel;

/** Every Check-In query key starts here. */
export const CHECK_INS_KEY = ["labour", "check-ins"] as const;

/** Keys of one Project's Check-In reads, for invalidation. */
const projectKeys = {
  people: (projectId: string) =>
    [...CHECK_INS_KEY, "people", projectId] as const,
  person: (projectId: string, kind: CheckInKind, personId: string) =>
    [...CHECK_INS_KEY, "person", projectId, kind, personId] as const,
  log: (projectId: string) => [...CHECK_INS_KEY, "log", projectId] as const,
};

function search(params: Record<string, string | null | undefined>): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params))
    if (value != null && value.length > 0) query.set(key, value);
  return query.toString();
}

/**
 * The Project's Site Engineers, Labours and Vendors with where each stands
 * today. Refreshed every minute and on focus, so a device left open at the
 * gate keeps true states.
 */
export function checkInPeopleQuery(projectId: string) {
  return queryOptions({
    queryKey: projectKeys.people(projectId),
    queryFn: () =>
      apiJson<CheckInPeople>(
        `${CHECK_INS_PATH}/people?${search({ projectId })}`,
      ),
    refetchInterval: 60_000,
    refetchOnWindowFocus: "always",
  });
}

/** One person, their state and today's entries: the capture screen. */
export function checkInPersonQuery(
  projectId: string,
  kind: CheckInKind,
  personId: string,
) {
  return queryOptions({
    queryKey: projectKeys.person(projectId, kind, personId),
    queryFn: () =>
      apiJson<CheckInPersonView>(
        `${CHECK_INS_PATH}/person?${search({ projectId, kind, personId })}`,
      ),
    // Another device may have checked them in since: read afresh each time.
    staleTime: 0,
  });
}

export type CheckInLogFilter = {
  projectId: string;
  /** `YYYY-MM-DD`; today (Company time) when null. */
  date: string | null;
  kind: CheckInKind | null;
  q: string;
};

/** A day's entries, newest first, 50 at a time ("Load more"). */
export function checkInLogQuery(filter: CheckInLogFilter) {
  const params = search({
    projectId: filter.projectId,
    date: filter.date,
    kind: filter.kind,
    q: filter.q.trim(),
  });
  return infiniteQueryOptions({
    queryKey: [...projectKeys.log(filter.projectId), params],
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) =>
      apiJson<CheckInLogPage>(
        `${CHECK_INS_PATH}?${pageParam == null ? params : `${params}&${search({ after: pageParam })}`}`,
      ),
    getNextPageParam: (last) => last.nextCursor,
  });
}

/** The photo taken with an entry (Attendance Read). */
export function checkInPhotoUrl(entryId: string): string {
  return `${CHECK_INS_PATH}/${encodeURIComponent(entryId)}/photo`;
}

/** The Labour's or Vendor's photo from their record; 404 when none. */
export function checkInPersonPhotoUrl(
  projectId: string,
  kind: CheckInKind,
  personId: string,
): string {
  return `${CHECK_INS_PATH}/people/${kind}/${encodeURIComponent(personId)}/photo?${search({ projectId })}`;
}

function postJson<T>(url: string, body: unknown): Promise<T> {
  return apiJson<T>(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

export function recordCheckIn(
  input: RecordCheckInInput,
): Promise<RecordCheckInResult> {
  return postJson(CHECK_INS_PATH, input);
}

export function voidCheckIn(input: {
  id: string;
  reason: string;
}): Promise<VoidCheckInResult> {
  return postJson(`${CHECK_INS_PATH}/${encodeURIComponent(input.id)}/void`, {
    reason: input.reason,
  });
}

/**
 * After an entry or a void: the lists, the person and the log of the
 * Project, and its Labour attendance, since a Labour's day follows their
 * entries (ADR CM-0043 §3).
 */
function invalidateAfter(
  queryClient: QueryClient,
  projectId: string,
  person: { kind: CheckInKind; id: string },
) {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: projectKeys.people(projectId) }),
    queryClient.invalidateQueries({
      queryKey: projectKeys.person(projectId, person.kind, person.id),
    }),
    queryClient.invalidateQueries({ queryKey: projectKeys.log(projectId) }),
    queryClient.invalidateQueries({
      queryKey: LABOUR_ATTENDANCE_KEY,
      // Sheet and month keys hold the id; list keys hold `projectId=<id>`.
      predicate: (query) =>
        query.queryKey.some(
          (part) =>
            part === projectId ||
            (typeof part === "string" &&
              new URLSearchParams(part).get("projectId") === projectId),
        ),
    }),
  ]);
}

/**
 * Records a Check In or Check Out. A refusal (`ALREADY_CHECKED_IN`,
 * `NOT_CHECKED_IN`, …) refreshes the person too, so the screen's default
 * action and "In since" line follow the server.
 */
export function useRecordCheckIn() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: recordCheckIn,
    onSuccess: (_result, input) =>
      invalidateAfter(queryClient, input.projectId, {
        kind: input.kind,
        id: input.personId,
      }),
    onError: (error, input) => {
      if (error instanceof QueryHttpError && error.status < 500)
        void invalidateAfter(queryClient, input.projectId, {
          kind: input.kind,
          id: input.personId,
        });
    },
  });
}

export function useVoidCheckIn(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: voidCheckIn,
    onSuccess: (result) =>
      invalidateAfter(queryClient, projectId, {
        kind: result.entry.kind,
        id: result.entry.personId,
      }),
  });
}
