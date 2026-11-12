import {
  infiniteQueryOptions,
  queryOptions,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import type { z } from "zod";

import type {
  CloseConstructionMarketingFollowUpRequestModel,
  ConstructionMarketingFollowUpResponse,
  CreateConstructionMarketingFollowUpRequestModel,
  DoneConstructionMarketingFollowUpRequestModel,
  GetConstructionMarketingFollowUpFormOptionsResponseModel,
  ListConstructionMarketingFollowUpsResponseModel,
  UpdateConstructionMarketingFollowUpRequestModel,
} from "@/app/api/construction/marketing/follow-ups/follow-up-models";
import { MARKETING_FOLLOW_UPS_PATH } from "@/lib/marketing-nav";
import type { FollowUpStatus } from "@/src/marketing/domain/marketing-terms";

import { apiJson, QueryHttpError } from "./http";
import { MARKETING_COMPANIES_KEY } from "./marketing-companies";

export type FollowUp = ConstructionMarketingFollowUpResponse;
export type FollowUpPage = z.infer<
  typeof ListConstructionMarketingFollowUpsResponseModel
>;
export type FollowUpFormOptions = z.infer<
  typeof GetConstructionMarketingFollowUpFormOptionsResponseModel
>;
export type CreateFollowUpInput = z.input<
  typeof CreateConstructionMarketingFollowUpRequestModel
>;
export type UpdateFollowUpInput = z.input<
  typeof UpdateConstructionMarketingFollowUpRequestModel
>;
export type DoneFollowUpInput = z.input<
  typeof DoneConstructionMarketingFollowUpRequestModel
>;
export type CloseFollowUpInput = z.input<
  typeof CloseConstructionMarketingFollowUpRequestModel
>;

export const MARKETING_FOLLOW_UPS_API =
  "/api/construction/marketing/follow-ups";

/** Every Follow-up read; writes invalidate it. */
export const MARKETING_FOLLOW_UPS_KEY = ["marketing", "follow-ups"] as const;

/** Rows per page of a list. */
const PAGE_SIZE = 100;

export type FollowUpFilters = {
  /** Only those the viewer owns. */
  mine?: boolean;
  ownerMemberId?: string;
  statuses?: readonly FollowUpStatus[];
  prospectCompanyId?: string;
  visitId?: string;
};

/** The list's query string without the cursor (shared with the stories' mock). */
/**
 * What the Follow-ups page opens on: the viewer's own Open ones. Kept here,
 * not in the client list, so the server page prefetches the same query.
 */
export const FOLLOW_UPS_OPENING_FILTERS: FollowUpFilters = {
  mine: true,
  statuses: ["open"],
};

export function followUpListParams(filters: FollowUpFilters = {}) {
  const params = new URLSearchParams({ limit: String(PAGE_SIZE) });
  const set = (key: string, value: string | undefined) => {
    if (value != null && value !== "") params.set(key, value);
  };
  if (filters.mine === true) params.set("mine", "1");
  set("ownerMemberId", filters.ownerMemberId);
  if (filters.statuses != null && filters.statuses.length > 0)
    params.set("status", filters.statuses.join(","));
  set("prospectCompanyId", filters.prospectCompanyId);
  set("visitId", filters.visitId);
  return params;
}

/** Follow-ups by due date, earliest first, a page at a time ("Load more"). */
export function followUpsQuery(filters: FollowUpFilters = {}) {
  const params = followUpListParams(filters);
  return infiniteQueryOptions({
    queryKey: [...MARKETING_FOLLOW_UPS_KEY, "list", params.toString()],
    initialPageParam: null as string | null,
    queryFn: ({ pageParam, meta }) => {
      const page = new URLSearchParams(params);
      if (pageParam != null) page.set("after", pageParam);
      return apiJson<FollowUpPage>(
        `${MARKETING_FOLLOW_UPS_API}?${page.toString()}`,
        undefined,
        meta,
      );
    },
    getNextPageParam: (last) => last.nextCursor,
  });
}

/** Active Marketing People, the companies to pick and the Company's today. */
export const followUpFormOptionsQuery = queryOptions({
  queryKey: [...MARKETING_FOLLOW_UPS_KEY, "form-options"],
  queryFn: ({ meta }) =>
    apiJson<FollowUpFormOptions>(
      `${MARKETING_FOLLOW_UPS_API}/form-options`,
      undefined,
      meta,
    ),
});

export function followUpQuery(id: string) {
  return queryOptions({
    queryKey: [...MARKETING_FOLLOW_UPS_KEY, "detail", id],
    queryFn: ({ meta }) =>
      apiJson<FollowUp>(
        `${MARKETING_FOLLOW_UPS_API}/${encodeURIComponent(id)}`,
        undefined,
        meta,
      ),
  });
}

/** The Follow-ups page. */
export function followUpsPath(): string {
  return MARKETING_FOLLOW_UPS_PATH;
}

function post<T>(path: string, body: unknown): Promise<T> {
  return apiJson<T>(`${MARKETING_FOLLOW_UPS_API}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const item = (id: string, action: string) =>
  `/${encodeURIComponent(id)}/${action}`;

/**
 * Refreshes every Follow-up read (the lists, a Visit's card) and every
 * Prospect Company read: a company's next follow-up date and its history
 * show them.
 */
function useSaved() {
  const client = useQueryClient();
  return async () => {
    await Promise.all([
      client.invalidateQueries({
        queryKey: MARKETING_FOLLOW_UPS_KEY,
        predicate: (query) => query.queryKey[2] !== "form-options",
      }),
      client.invalidateQueries({ queryKey: MARKETING_COMPANIES_KEY }),
    ]);
  };
}

export function useCreateFollowUp() {
  const saved = useSaved();
  return useMutation({
    mutationFn: (input: CreateFollowUpInput) => post<FollowUp>("", input),
    onSuccess: saved,
  });
}

export function useUpdateFollowUp(id: string) {
  const saved = useSaved();
  return useMutation({
    mutationFn: (input: UpdateFollowUpInput) =>
      post<FollowUp>(item(id, "update"), input),
    onSuccess: saved,
  });
}

export function useDoneFollowUp(id: string) {
  const saved = useSaved();
  return useMutation({
    mutationFn: (input: DoneFollowUpInput) =>
      post<FollowUp>(item(id, "done"), input),
    onSuccess: saved,
  });
}

export function useCancelFollowUp(id: string) {
  const saved = useSaved();
  return useMutation({
    mutationFn: (input: CloseFollowUpInput) =>
      post<FollowUp>(item(id, "cancel"), input),
    onSuccess: saved,
  });
}

export function useDeleteFollowUp(id: string) {
  const saved = useSaved();
  return useMutation({
    mutationFn: (input: CloseFollowUpInput) =>
      post<undefined>(item(id, "delete"), input),
    onSuccess: saved,
  });
}

/**
 * What to say for a failed Follow-up write: a stale one (409
 * `FOLLOW_UP_CHANGED`) asks for a reload; other refusals say the server's
 * words.
 */
export function followUpErrorMessage(error: unknown): string {
  if (error instanceof QueryHttpError) {
    if (error.code === "FOLLOW_UP_CHANGED")
      return "Someone else changed this Follow-up after you opened it. Reload the page to see their changes, then try again.";
    return error.message;
  }
  return "Something went wrong. Please try again.";
}
