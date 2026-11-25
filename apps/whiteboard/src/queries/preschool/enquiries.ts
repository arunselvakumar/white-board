import { queryOptions } from "@tanstack/react-query";

import type {
  CreateEnquiryInput,
  EnquiryInput,
  FollowUpInput,
  MoveEnquiryInput,
} from "@/src/preschool/application/enquiry-handlers";
import type {
  EnquiryActivityView,
  EnquiryDetailView,
  EnquiryPageView,
  EnquiryPhoneMatchesView,
  EnquirySummaryView,
  EnquiryView,
} from "@/src/preschool/application/enquiry-views";
import type {
  EnquiryListFilter,
  EnquirySource,
  EnquiryStatus,
  MovableEnquiryStatus,
} from "@/src/preschool/domain/enquiry";

import { apiJson } from "../http";
import { preschoolKeys } from "./me";

export type PreschoolEnquiry = EnquiryView;
export type PreschoolEnquiryDetail = EnquiryDetailView;
export type PreschoolEnquiryActivity = EnquiryActivityView;
export type PreschoolEnquiryPage = EnquiryPageView;
export type PreschoolEnquirySummary = EnquirySummaryView;
export type PreschoolEnquiryPhoneMatches = EnquiryPhoneMatchesView;
export type PreschoolEnquiryStatus = EnquiryStatus;
export type PreschoolEnquirySource = EnquirySource;
export type PreschoolEnquiryListView = EnquiryListFilter;
export type PreschoolEnquiryInput = EnquiryInput;
export type CreatePreschoolEnquiryInput = CreateEnquiryInput;
export type PreschoolEnquiryFollowUpInput = FollowUpInput;
export type MovePreschoolEnquiryInput = MoveEnquiryInput;

export type PreschoolEnquiryFilters = {
  centreId: string;
  status?: EnquiryStatus;
  view?: EnquiryListFilter;
  q?: string;
  limit?: number;
  cursor?: string;
};

const BASE = "/api/preschool/enquiries";

export const preschoolEnquiryKeys = {
  all: [...preschoolKeys.all, "enquiries"] as const,
  list: (filters: PreschoolEnquiryFilters) =>
    [...preschoolEnquiryKeys.all, "list", filters] as const,
  summary: (centreId: string) =>
    [...preschoolEnquiryKeys.all, "summary", centreId] as const,
  detail: (id: string) => [...preschoolEnquiryKeys.all, "detail", id] as const,
  phoneMatches: (centreId: string, phone: string, excludeEnquiryId?: string) =>
    [
      ...preschoolEnquiryKeys.all,
      "phone-matches",
      centreId,
      phone,
      excludeEnquiryId ?? null,
    ] as const,
};

function search(values: Record<string, string | number | undefined>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(values))
    if (value !== undefined && value !== "") params.set(key, String(value));
  return params.toString();
}

export function preschoolEnquiriesQueryOptions(
  filters: PreschoolEnquiryFilters,
) {
  return queryOptions({
    queryKey: preschoolEnquiryKeys.list(filters),
    queryFn: ({ meta }) =>
      apiJson<PreschoolEnquiryPage>(`${BASE}?${search(filters)}`, {}, meta),
  });
}

export function preschoolEnquirySummaryQueryOptions(centreId: string) {
  return queryOptions({
    queryKey: preschoolEnquiryKeys.summary(centreId),
    queryFn: ({ meta }) =>
      apiJson<PreschoolEnquirySummary>(
        `${BASE}/summary?${search({ centreId })}`,
        {},
        meta,
      ),
  });
}

export function preschoolEnquiryQueryOptions(id: string) {
  return queryOptions({
    queryKey: preschoolEnquiryKeys.detail(id),
    queryFn: ({ meta }) =>
      apiJson<PreschoolEnquiryDetail>(`${BASE}/${id}`, {}, meta),
  });
}

export function preschoolEnquiryPhoneMatchesQueryOptions(
  centreId: string,
  phone: string,
  excludeEnquiryId?: string,
) {
  return queryOptions({
    queryKey: preschoolEnquiryKeys.phoneMatches(
      centreId,
      phone,
      excludeEnquiryId,
    ),
    queryFn: ({ meta }) =>
      apiJson<PreschoolEnquiryPhoneMatches>(
        `${BASE}/phone-matches?${search({ centreId, phone, excludeEnquiryId })}`,
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

export function createPreschoolEnquiry(
  input: CreatePreschoolEnquiryInput,
): Promise<PreschoolEnquiryDetail> {
  return post("", input);
}

export function updatePreschoolEnquiryDetails(
  id: string,
  input: PreschoolEnquiryInput,
): Promise<PreschoolEnquiryDetail> {
  return post(`/${id}/details`, input);
}

export function logPreschoolEnquiryFollowUp(
  id: string,
  input: PreschoolEnquiryFollowUpInput,
): Promise<PreschoolEnquiryDetail> {
  return post(`/${id}/follow-ups`, input);
}

export function movePreschoolEnquiry(
  id: string,
  input: MovePreschoolEnquiryInput,
): Promise<PreschoolEnquiryDetail> {
  return post(`/${id}/status`, input);
}

export function markPreschoolEnquiryLost(
  id: string,
  reason: string,
): Promise<PreschoolEnquiryDetail> {
  return post(`/${id}/lost`, { reason });
}

export function reopenPreschoolEnquiry(
  id: string,
  input: { nextFollowUpOn?: string | null; note?: string | null } = {},
): Promise<PreschoolEnquiryDetail> {
  return post(`/${id}/reopen`, input);
}

export const PRESCHOOL_ENQUIRY_STATUS_LABELS: Record<EnquiryStatus, string> = {
  new: "New",
  contacted: "Contacted",
  visit_scheduled: "Visit scheduled",
  visited: "Visited",
  admitted: "Admitted",
  lost: "Lost",
};

export const PRESCHOOL_ENQUIRY_SOURCE_LABELS: Record<EnquirySource, string> = {
  walk_in: "Walk-in",
  referral: "Referral",
  google: "Google",
  social_media: "Social media",
  flyer: "Flyer",
  head_office: "Head Office",
  other: "Other",
};

export const PRESCHOOL_ENQUIRY_MOVABLE_STATUSES: readonly MovableEnquiryStatus[] =
  ["contacted", "visit_scheduled", "visited"];
