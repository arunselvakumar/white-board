import {
  queryOptions,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import type { z } from "zod";

import type {
  AddConstructionSalesFollowUpRequestModel,
  ConstructionSalesFollowUpResponse,
  ConstructionSalesInquiryTaskResponse,
  CreateConstructionSalesInquiryTaskRequestModel,
  ListConstructionSalesInquiryActivityResponse,
  ListConstructionSalesInquiryTasksResponse,
} from "@/app/api/construction/sales/inquiries/activity-models";
import type {
  ConstructionSalesInquiryDetailResponse,
  ConstructionSalesInquiryDuplicateDetails,
  ConstructionSalesInquiryResponse,
  CreateConstructionSalesInquiryRequestModel,
  GetConstructionSalesInquiryFormOptionsResponse,
  ListConstructionSalesInquiriesResponse,
  UpdateConstructionSalesInquiryRequestModel,
} from "@/app/api/construction/sales/inquiries/inquiry-models";
import type {
  FollowUpDue,
  InquiryStatus,
  InterestType,
} from "@/src/sales/domain/sales-terms";

import { apiJson, QueryHttpError } from "./http";
import { SALES_API, SALES_KEY } from "./sales-access";

export type Inquiry = ConstructionSalesInquiryResponse;
export type InquiryDetail = ConstructionSalesInquiryDetailResponse;
export type InquiryPage = ListConstructionSalesInquiriesResponse;
export type InquiryFormOptions = GetConstructionSalesInquiryFormOptionsResponse;
export type InquiryDuplicateMatch =
  ConstructionSalesInquiryDuplicateDetails["matches"][number];
export type CreateInquiryInput = z.input<
  typeof CreateConstructionSalesInquiryRequestModel
>;
export type UpdateInquiryInput = z.input<
  typeof UpdateConstructionSalesInquiryRequestModel
>;

export const INQUIRIES_API = `${SALES_API}/inquiries`;
/** Every inquiry read; writes invalidate it (CM-1003). */
export const INQUIRIES_KEY = [...SALES_KEY, "inquiries"] as const;

export type InquiryFilters = {
  statuses?: readonly InquiryStatus[];
  funnelStageId?: string;
  interestTypes?: readonly InterestType[];
  leadSourceId?: string;
  assigneeMemberId?: string;
  due?: FollowUpDue | "";
  search?: string;
  cursor?: { after?: string; before?: string } | null;
};

/** The query string of a list request (shared with the stories' mock). */
export function inquiryListParams(
  projectId: string,
  filters: InquiryFilters = {},
): URLSearchParams {
  const params = new URLSearchParams({ projectId, limit: "25" });
  const set = (key: string, value: string | undefined) => {
    if (value != null && value !== "") params.set(key, value);
  };
  if (filters.statuses != null && filters.statuses.length > 0)
    params.set("status", filters.statuses.join(","));
  if (filters.interestTypes != null && filters.interestTypes.length > 0)
    params.set("interestType", filters.interestTypes.join(","));
  set("funnelStageId", filters.funnelStageId);
  set("leadSourceId", filters.leadSourceId);
  set("assigneeMemberId", filters.assigneeMemberId);
  set("due", filters.due);
  set("search", filters.search?.trim());
  set("after", filters.cursor?.after);
  set("before", filters.cursor?.before);
  return params;
}

/** A Project's inquiries the viewer may see, newest first. */
export function inquiriesQuery(
  projectId: string,
  filters: InquiryFilters = {},
) {
  const params = inquiryListParams(projectId, filters);
  return queryOptions({
    queryKey: [...INQUIRIES_KEY, "list", params.toString()],
    queryFn: () => apiJson<InquiryPage>(`${INQUIRIES_API}?${params}`),
  });
}

export function inquiryQuery(id: string) {
  return queryOptions({
    queryKey: [...INQUIRIES_KEY, "detail", id],
    queryFn: () =>
      apiJson<InquiryDetail>(`${INQUIRIES_API}/${encodeURIComponent(id)}`),
  });
}

/** Team Members, Wings, stages, Lead Sources and Lost Reasons on the Project. */
export function inquiryFormOptionsQuery(projectId: string) {
  const params = new URLSearchParams({ projectId });
  return queryOptions({
    queryKey: [...SALES_KEY, "inquiry-form-options", projectId],
    queryFn: () =>
      apiJson<InquiryFormOptions>(`${INQUIRIES_API}/form-options?${params}`),
    staleTime: 60_000,
  });
}

function post<T>(path: string, body: unknown): Promise<T> {
  return apiJson<T>(`${INQUIRIES_API}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function useInvalidate() {
  const client = useQueryClient();
  return () => client.invalidateQueries({ queryKey: INQUIRIES_KEY });
}

const item = (id: string, action: string) =>
  `/${encodeURIComponent(id)}/${action}`;

export function useCreateInquiry() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (input: CreateInquiryInput) => post<InquiryDetail>("", input),
    onSuccess: invalidate,
  });
}

export function useUpdateInquiry(id: string) {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (input: UpdateInquiryInput) =>
      post<InquiryDetail>(item(id, "update"), input),
    onSuccess: invalidate,
  });
}

export function useDeleteInquiry(id: string) {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (expectedUpdatedAt: string) =>
      post<undefined>(item(id, "delete"), { expectedUpdatedAt }),
    onSuccess: invalidate,
  });
}

/** The matches of a 409 `INQUIRY_DUPLICATE`, or null for any other error. */
export function duplicateMatches(
  error: unknown,
): InquiryDuplicateMatch[] | null {
  if (!(error instanceof QueryHttpError) || error.code !== "INQUIRY_DUPLICATE")
    return null;
  const matches = (error.details as { matches?: unknown } | undefined)?.matches;
  return Array.isArray(matches) ? (matches as InquiryDuplicateMatch[]) : [];
}

/** Pages of a Project's inquiries. */
export function inquiriesPath(projectId: string, id?: string): string {
  const base = `/app/projects/${encodeURIComponent(projectId)}/inquiries/list`;
  return id == null ? base : `${base}/${encodeURIComponent(id)}`;
}

// ---------------------------------------------------------------------------
// CM-1004: follow-ups and Inquiry Tasks
// ---------------------------------------------------------------------------

export type InquiryActivity = ListConstructionSalesInquiryActivityResponse;
export type InquiryActivityItem = InquiryActivity["items"][number];
export type FollowUp = ConstructionSalesFollowUpResponse;
export type InquiryTask = ConstructionSalesInquiryTaskResponse;
export type InquiryTasks = ListConstructionSalesInquiryTasksResponse;
export type AddFollowUpInput = z.input<
  typeof AddConstructionSalesFollowUpRequestModel
>;
export type InquiryTaskInput = z.input<
  typeof CreateConstructionSalesInquiryTaskRequestModel
>;

/** The inquiry's follow-ups merged with its history, newest first. */
export function inquiryActivityQuery(id: string) {
  return queryOptions({
    queryKey: [...INQUIRIES_KEY, "activity", id],
    queryFn: () =>
      apiJson<InquiryActivity>(
        `${INQUIRIES_API}/${encodeURIComponent(id)}/activity`,
      ),
  });
}

export function inquiryTasksQuery(id: string) {
  return queryOptions({
    queryKey: [...INQUIRIES_KEY, "tasks", id],
    queryFn: () =>
      apiJson<InquiryTasks>(`${INQUIRIES_API}/${encodeURIComponent(id)}/tasks`),
  });
}

/** Records a follow-up; refreshes the inquiry, its timeline and the lists. */
export function useAddFollowUp(id: string) {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (input: AddFollowUpInput) =>
      post<InquiryDetail>(item(id, "follow-ups"), input),
    onSuccess: invalidate,
  });
}

export function useDeleteFollowUp(id: string) {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (followUpId: string) =>
      post<undefined>(
        `/${encodeURIComponent(id)}/follow-ups/${encodeURIComponent(followUpId)}/delete`,
        {},
      ),
    onSuccess: invalidate,
  });
}

export type InquiryTaskCommand =
  | { kind: "create"; input: InquiryTaskInput }
  | {
      kind: "update";
      taskId: string;
      input: InquiryTaskInput;
      expectedUpdatedAt: string;
    }
  | { kind: "done" | "reopen" | "delete"; taskId: string };

/** Add, edit, tick, untick and delete an inquiry's tasks. */
export function useInquiryTaskCommand(id: string) {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (command: InquiryTaskCommand) => {
      const base = `/${encodeURIComponent(id)}/tasks`;
      switch (command.kind) {
        case "create":
          return post<InquiryTask>(base, command.input);
        case "update":
          return post<InquiryTask>(
            `${base}/${encodeURIComponent(command.taskId)}/update`,
            { ...command.input, expectedUpdatedAt: command.expectedUpdatedAt },
          );
        default:
          return post<InquiryTask | undefined>(
            `${base}/${encodeURIComponent(command.taskId)}/${command.kind}`,
            {},
          );
      }
    },
    onSuccess: invalidate,
  });
}

// ---------------------------------------------------------------------------
// CM-1007: close, reopen, import
// ---------------------------------------------------------------------------

export type CloseInquiryInput =
  | {
      kind: "convert";
      unitId: string;
      bookingDate: string | null;
      expectedUpdatedAt: string;
    }
  | {
      kind: "lose";
      lostReasonId: string;
      remarks: string | null;
      expectedUpdatedAt: string;
    };

/** Close as Converted (books the unit) or Lost; refreshes inquiries and bookings. */
export function useCloseInquiry(id: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: CloseInquiryInput) => {
      const { kind, ...body } = input;
      return post<InquiryDetail>(item(id, kind), body);
    },
    onSuccess: () => client.invalidateQueries({ queryKey: [...SALES_KEY] }),
  });
}

export function useReopenInquiry(id: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (expectedUpdatedAt: string) =>
      post<InquiryDetail>(item(id, "reopen"), { expectedUpdatedAt }),
    onSuccess: () => client.invalidateQueries({ queryKey: [...SALES_KEY] }),
  });
}

export type InquiryImportRowError = {
  row: number;
  field: string;
  message: string;
};

/** The import sample's download link (with a Lists sheet of the Project's names). */
export function inquirySampleUrl(projectId: string): string {
  return `${INQUIRIES_API}/import-sample?projectId=${encodeURIComponent(projectId)}`;
}

/** Uploads a filled sample: every row or none (`IMPORT_HAS_ERRORS`). */
export function useImportInquiries(projectId: string) {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (input: { file: File; allowDuplicates: boolean }) =>
      apiJson<{ imported: number }>(
        `${INQUIRIES_API}/import?projectId=${encodeURIComponent(projectId)}&allowDuplicates=${String(input.allowDuplicates)}`,
        {
          method: "POST",
          headers: {
            "content-type":
              "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          },
          body: input.file,
        },
      ),
    onSuccess: invalidate,
  });
}
