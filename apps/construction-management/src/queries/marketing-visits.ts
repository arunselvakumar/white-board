import {
  infiniteQueryOptions,
  queryOptions,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import type { z } from "zod";

import type {
  AddConstructionMarketingVisitNoteRequestModel,
  CancelConstructionMarketingVisitRequestModel,
  CompleteConstructionMarketingVisitRequestModel,
  ConstructionMarketingVisitListItemResponseModel,
  ConstructionMarketingVisitResponse,
  CreateConstructionMarketingVisitRequestModel,
  GetConstructionMarketingVisitFormOptionsResponse,
  ListConstructionMarketingVisitsResponse,
  RescheduleConstructionMarketingVisitRequestModel,
  UpdateConstructionMarketingVisitRequestModel,
} from "@/app/api/construction/marketing/visits/visit-models";
import { MARKETING_VISITS_PATH } from "@/lib/marketing-nav";
import type {
  Interest,
  VisitPurpose,
  VisitShownStatus,
} from "@/src/marketing/domain/marketing-terms";

import { apiJson, QueryHttpError } from "./http";
import { MARKETING_COMPANIES_KEY } from "./marketing-companies";
import { MARKETING_FOLLOW_UPS_KEY } from "./marketing-follow-ups";

export type Visit = ConstructionMarketingVisitResponse;
export type VisitListItem = z.infer<
  typeof ConstructionMarketingVisitListItemResponseModel
>;
export type VisitPage = ListConstructionMarketingVisitsResponse;
export type VisitFormOptions = GetConstructionMarketingVisitFormOptionsResponse;
export type VisitHistoryItem = Visit["history"][number];
export type CreateVisitInput = z.input<
  typeof CreateConstructionMarketingVisitRequestModel
>;
export type UpdateVisitInput = z.input<
  typeof UpdateConstructionMarketingVisitRequestModel
>;
export type CompleteVisitInput = z.input<
  typeof CompleteConstructionMarketingVisitRequestModel
>;
export type RescheduleVisitInput = z.input<
  typeof RescheduleConstructionMarketingVisitRequestModel
>;
export type CancelVisitInput = z.input<
  typeof CancelConstructionMarketingVisitRequestModel
>;
export type AddVisitNoteInput = z.input<
  typeof AddConstructionMarketingVisitNoteRequestModel
>;

export const MARKETING_VISITS_API = "/api/construction/marketing/visits";

/** Every Visit read; writes invalidate it. */
export const MARKETING_VISITS_KEY = ["marketing", "visits"] as const;

/** Rows per page of the list. */
const PAGE_SIZE = 50;

export type VisitFilters = {
  /** `YYYY-MM-DD`, inclusive, in the Company time zone. */
  from?: string;
  to?: string;
  memberId?: string;
  prospectCompanyId?: string;
  statuses?: readonly VisitShownStatus[];
  purposes?: readonly VisitPurpose[];
  interests?: readonly Interest[];
};

/** The list's query string without the cursor (shared with the stories' mock). */
export function visitListParams(filters: VisitFilters = {}) {
  const params = new URLSearchParams({ limit: String(PAGE_SIZE) });
  const set = (key: string, value: string | undefined) => {
    if (value != null && value !== "") params.set(key, value);
  };
  const list = (key: string, values: readonly string[] | undefined) => {
    if (values != null && values.length > 0) params.set(key, values.join(","));
  };
  set("from", filters.from);
  set("to", filters.to);
  set("memberId", filters.memberId);
  set("prospectCompanyId", filters.prospectCompanyId);
  list("status", filters.statuses);
  list("purpose", filters.purposes);
  list("interest", filters.interests);
  return params;
}

/** Visits newest first, a page at a time ("Load more"). */
export function visitsQuery(filters: VisitFilters = {}) {
  const params = visitListParams(filters);
  return infiniteQueryOptions({
    queryKey: [...MARKETING_VISITS_KEY, "list", params.toString()],
    initialPageParam: null as string | null,
    queryFn: ({ pageParam, meta }) => {
      const page = new URLSearchParams(params);
      if (pageParam != null) page.set("after", pageParam);
      return apiJson<VisitPage>(
        `${MARKETING_VISITS_API}?${page.toString()}`,
        undefined,
        meta,
      );
    },
    getNextPageParam: (last) => last.nextCursor,
  });
}

/** Marketing People, the companies to pick from and what the caller may add. */
export const visitFormOptionsQuery = queryOptions({
  queryKey: [...MARKETING_VISITS_KEY, "form-options"],
  queryFn: ({ meta }) =>
    apiJson<VisitFormOptions>(
      `${MARKETING_VISITS_API}/form-options`,
      undefined,
      meta,
    ),
});

export function visitQuery(id: string) {
  return queryOptions({
    queryKey: [...MARKETING_VISITS_KEY, "detail", id],
    queryFn: ({ meta }) =>
      apiJson<Visit>(
        `${MARKETING_VISITS_API}/${encodeURIComponent(id)}`,
        undefined,
        meta,
      ),
  });
}

/** The Visit page, or the list without an id. */
export function visitPath(id?: string): string {
  return id == null
    ? MARKETING_VISITS_PATH
    : `${MARKETING_VISITS_PATH}/${encodeURIComponent(id)}`;
}

/**
 * The form: plan or log, with a company already picked when given, and
 * its points of contact and visitors (Log the visit from a Follow-up).
 */
export function newVisitPath(
  status: "planned" | "completed",
  prospectCompanyId?: string,
  people: {
    contactIds?: readonly string[];
    visitorIds?: readonly string[];
  } = {},
): string {
  const params = new URLSearchParams({ status });
  if (prospectCompanyId != null)
    params.set("prospectCompanyId", prospectCompanyId);
  if (people.contactIds != null && people.contactIds.length > 0)
    params.set("contactIds", people.contactIds.join(","));
  if (people.visitorIds != null && people.visitorIds.length > 0)
    params.set("visitorIds", people.visitorIds.join(","));
  return `${MARKETING_VISITS_PATH}/new?${params.toString()}`;
}

function post<T>(path: string, body: unknown): Promise<T> {
  return apiJson<T>(`${MARKETING_VISITS_API}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const item = (id: string, action: string) =>
  `/${encodeURIComponent(id)}/${action}`;

/**
 * Keeps the answered Visit as its page's data, then refreshes the Visit
 * lists and form options, every Prospect Company read (a Visit shows on
 * its company's history, may move its Stage, and may add the company or
 * Contacts) and the Follow-up lists (its Next Follow-up).
 */
function useSaved() {
  const client = useQueryClient();
  return async (visit: Visit) => {
    client.setQueryData(visitQuery(visit.id).queryKey, visit);
    await Promise.all([
      client.invalidateQueries({
        queryKey: MARKETING_VISITS_KEY,
        predicate: (query) => query.queryKey[2] !== "detail",
      }),
      client.invalidateQueries({ queryKey: MARKETING_COMPANIES_KEY }),
      client.invalidateQueries({ queryKey: MARKETING_FOLLOW_UPS_KEY }),
    ]);
  };
}

export function useCreateVisit() {
  const saved = useSaved();
  return useMutation({
    mutationFn: (input: CreateVisitInput) => post<Visit>("", input),
    onSuccess: saved,
  });
}

export function useUpdateVisit(id: string) {
  const saved = useSaved();
  return useMutation({
    mutationFn: (input: UpdateVisitInput) =>
      post<Visit>(item(id, "update"), input),
    onSuccess: saved,
  });
}

export function useCompleteVisit(id: string) {
  const saved = useSaved();
  return useMutation({
    mutationFn: (input: CompleteVisitInput) =>
      post<Visit>(item(id, "complete"), input),
    onSuccess: saved,
  });
}

export function useRescheduleVisit(id: string) {
  const saved = useSaved();
  return useMutation({
    mutationFn: (input: RescheduleVisitInput) =>
      post<Visit>(item(id, "reschedule"), input),
    onSuccess: saved,
  });
}

export function useCancelVisit(id: string) {
  const saved = useSaved();
  return useMutation({
    mutationFn: (input: CancelVisitInput) =>
      post<Visit>(item(id, "cancel"), input),
    onSuccess: saved,
  });
}

export function useAddVisitNote(id: string) {
  const saved = useSaved();
  return useMutation({
    mutationFn: (input: AddVisitNoteInput) =>
      post<Visit>(item(id, "notes"), input),
    onSuccess: saved,
  });
}

export function useDeleteVisit(id: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (expectedUpdatedAt: string) =>
      post<undefined>(item(id, "delete"), { expectedUpdatedAt }),
    onSuccess: async () => {
      // The open page still reads the Visit until it navigates away, so its
      // query is only marked stale, never refetched into a 404.
      await client.invalidateQueries({
        queryKey: MARKETING_VISITS_KEY,
        refetchType: "none",
      });
      await Promise.all([
        client.invalidateQueries({
          queryKey: MARKETING_VISITS_KEY,
          predicate: (query) => query.queryKey[2] !== "detail",
        }),
        client.invalidateQueries({ queryKey: MARKETING_COMPANIES_KEY }),
      ]);
    },
  });
}

/**
 * What to say for a failed Visit write: a stale record (409 `*_CHANGED`)
 * asks for a reload; other refusals say the server's words.
 */
export function visitErrorMessage(error: unknown): string {
  if (error instanceof QueryHttpError) {
    if (error.code.endsWith("_CHANGED"))
      return `Someone else changed this ${error.code.startsWith("VISIT") ? "Visit" : "Prospect Company"} after you opened it. Reload the page to see their changes, then try again.`;
    return error.message;
  }
  return "Something went wrong. Please try again.";
}
