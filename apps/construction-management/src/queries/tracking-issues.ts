import {
  queryOptions,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import type { z } from "zod";

import type {
  BulkConstructionTrackingIssuesResponse,
  ConstructionTrackingIssueDetailResponse,
  ConstructionTrackingIssueProgressResponse,
  ConstructionTrackingIssueResponse,
  CreateConstructionTrackingIssueRequestModel,
  GetConstructionTrackingIssueFormOptionsResponse,
  ListConstructionTrackingIssueProgressResponse,
  ListConstructionTrackingIssuesResponse,
  UpdateConstructionTrackingIssueRequestModel,
} from "@/app/api/construction/tracking/issues/issue-models";
import type { LocationType } from "@/src/shared-kernel/location-ref";
import type { IssueStatus } from "@/src/tracking/domain/issue";
import type { TrackingPriority } from "@/src/tracking/domain/tracking-documents";

import { apiJson } from "./http";
import { TRACKING_API, TRACKING_KEY } from "./tracking-access";

export type Issue = ConstructionTrackingIssueResponse;
export type IssueDetail = ConstructionTrackingIssueDetailResponse;
export type IssuePage = ListConstructionTrackingIssuesResponse;
export type IssueProgress = ConstructionTrackingIssueProgressResponse;
export type IssueProgressPage = ListConstructionTrackingIssueProgressResponse;
export type IssueFormOptions = GetConstructionTrackingIssueFormOptionsResponse;
export type IssueBulkResult = BulkConstructionTrackingIssuesResponse;
export type CreateIssueInput = z.input<
  typeof CreateConstructionTrackingIssueRequestModel
>;
export type UpdateIssueInput = z.input<
  typeof UpdateConstructionTrackingIssueRequestModel
>;

export const ISSUES_API = `${TRACKING_API}/issues`;
/** Every Issues & Snags read; writes invalidate it (CM-803). */
export const ISSUES_KEY = [...TRACKING_KEY, "issues"] as const;

export type IssueFilters = {
  statuses?: readonly IssueStatus[];
  priorities?: readonly TrackingPriority[];
  categoryId?: string;
  assigneeMemberId?: string;
  departmentId?: string;
  contractorId?: string;
  locationType?: LocationType;
  placeId?: string;
  from?: string;
  to?: string;
  search?: string;
  cursor?: { after?: string; before?: string } | null;
};

/** The query string of a list request (shared with the stories' mock). */
export function issueListParams(
  projectId: string,
  filters: IssueFilters = {},
): URLSearchParams {
  const params = new URLSearchParams({ projectId, limit: "25" });
  const set = (key: string, value: string | undefined) => {
    if (value != null && value !== "") params.set(key, value);
  };
  if (filters.statuses != null && filters.statuses.length > 0)
    params.set("status", filters.statuses.join(","));
  if (filters.priorities != null && filters.priorities.length > 0)
    params.set("priority", filters.priorities.join(","));
  set("categoryId", filters.categoryId);
  set("assigneeMemberId", filters.assigneeMemberId);
  set("departmentId", filters.departmentId);
  set("contractorId", filters.contractorId);
  set("locationType", filters.locationType);
  if (filters.locationType != null) set("placeId", filters.placeId);
  set("from", filters.from);
  set("to", filters.to);
  set("search", filters.search?.trim());
  set("after", filters.cursor?.after);
  set("before", filters.cursor?.before);
  return params;
}

/** A Project's issues the viewer may see, newest first. */
export function issuesQuery(projectId: string, filters: IssueFilters = {}) {
  const params = issueListParams(projectId, filters);
  return queryOptions({
    queryKey: [...ISSUES_KEY, "list", params.toString()],
    queryFn: () => apiJson<IssuePage>(`${ISSUES_API}?${params}`),
  });
}

export function issueQuery(id: string) {
  return queryOptions({
    queryKey: [...ISSUES_KEY, "detail", id],
    queryFn: () =>
      apiJson<IssueDetail>(`${ISSUES_API}/${encodeURIComponent(id)}`),
  });
}

/** The issue's Progress thread, oldest first. */
export function issueProgressQuery(id: string) {
  return queryOptions({
    queryKey: [...ISSUES_KEY, "progress", id],
    queryFn: () =>
      apiJson<IssueProgressPage>(
        `${ISSUES_API}/${encodeURIComponent(id)}/progress`,
      ),
  });
}

/** Assign To, Departments, Contractors and Issue Categories on the Project. */
export function issueFormOptionsQuery(projectId: string) {
  const params = new URLSearchParams({ projectId });
  return queryOptions({
    queryKey: [...ISSUES_KEY, "form-options", projectId],
    queryFn: () =>
      apiJson<IssueFormOptions>(`${ISSUES_API}/form-options?${params}`),
    staleTime: 60_000,
  });
}

function post<T>(path: string, body: unknown): Promise<T> {
  return apiJson<T>(`${ISSUES_API}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function useInvalidate() {
  const client = useQueryClient();
  return () => client.invalidateQueries({ queryKey: ISSUES_KEY });
}

const item = (id: string, action: string) =>
  `/${encodeURIComponent(id)}/${action}`;

export function useCreateIssue() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (input: CreateIssueInput) => post<IssueDetail>("", input),
    onSuccess: invalidate,
  });
}

export function useUpdateIssue(id: string) {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (input: UpdateIssueInput) =>
      post<IssueDetail>(item(id, "update"), input),
    onSuccess: invalidate,
  });
}

/** Mark As Solved, Verify or Reopen (with its reason) one issue. */
export function useIssueTransition(id: string) {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (
      input:
        | { action: "solve" }
        | { action: "verify" }
        | { action: "reopen"; reason: string },
    ) =>
      post<IssueDetail>(
        item(id, input.action),
        input.action === "reopen" ? { reason: input.reason } : {},
      ),
    onSuccess: invalidate,
  });
}

/** Bulk Mark As Solved or Verify: the rest are skipped and counted. */
export function useBulkIssueTransition() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (input: {
      action: "solve" | "verify";
      projectId: string;
      ids: string[];
    }) =>
      post<IssueBulkResult>(`/bulk-${input.action}`, {
        projectId: input.projectId,
        ids: input.ids,
      }),
    onSuccess: invalidate,
  });
}

export function useDeleteIssue(id: string) {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (expectedUpdatedAt: string) =>
      post<undefined>(item(id, "delete"), { expectedUpdatedAt }),
    onSuccess: invalidate,
  });
}

/** Posts a Progress update with the ids of images already uploaded to the issue. */
export function usePostIssueProgress(id: string) {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (input: { body: string | null; fileIds: string[] }) =>
      post<IssueProgress>(item(id, "progress"), input),
    onSuccess: invalidate,
  });
}

export function useDeleteIssueProgress(id: string) {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (updateId: string) =>
      post<undefined>(
        `/${encodeURIComponent(id)}/progress/${encodeURIComponent(updateId)}/delete`,
        {},
      ),
    onSuccess: invalidate,
  });
}

/** Pages of a Project's Issues & Snags. */
export function issuesPath(projectId: string, id?: string): string {
  const base = `/app/projects/${encodeURIComponent(projectId)}/issues`;
  return id == null ? base : `${base}/${encodeURIComponent(id)}`;
}
