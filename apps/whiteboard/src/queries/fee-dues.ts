import { queryOptions } from "@tanstack/react-query";

import { apiJson } from "./http";

const BASE = "/api/training-institute";
const jsonHeaders = { "content-type": "application/json" };

export type FeeDuesFilter = "overdue" | "due_soon" | "all";
export type FeeDuesSort = "amount" | "due_date";
export type FeeFollowUpChannel =
  "phone" | "whatsapp_sms" | "in_person" | "other";
export type FeeFollowUpCloseReason = "superseded" | "done" | "dues_cleared";

export type FeeDueResponse = {
  enrollmentId: string;
  studentId: string;
  studentName: string;
  courseId: string;
  courseName: string;
  batchId: string;
  batchName: string;
  /** Ended Enrollments still appear while money is owed. */
  enrollmentEnded: boolean;
  remainingPaise: number;
  overduePaise: number;
  overdue: boolean;
  dueSoon: boolean;
  /** "unclear" when the due-date amounts don't add up to the Fee Plan. */
  dueDatesClarity: "clear" | "unclear";
  oldestUnpaidDueOn: string | null;
  nextUnpaidDueOn: string | null;
  dueDates: { dueOn: string; amountPaise: number }[];
  openFollowUp: {
    id: string;
    channel: FeeFollowUpChannel;
    nextFollowUpOn: string | null;
  } | null;
};

export type FeeDuesResponse = {
  filter: FeeDuesFilter;
  sort: FeeDuesSort;
  items: FeeDueResponse[];
  counts: { overdue: number; dueSoon: number; all: number };
  totalRemainingPaise: number;
};

export type FeeFollowUpDueResponse = {
  id: string;
  enrollmentId: string;
  studentId: string;
  studentName: string;
  courseName: string;
  batchName: string;
  remainingPaise: number;
  channel: FeeFollowUpChannel;
  note: string | null;
  nextFollowUpOn: string;
  /** 0 when due today. */
  daysOverdue: number;
};

export type FeeFollowUpResponse = {
  id: string;
  enrollmentId: string;
  channel: FeeFollowUpChannel;
  note: string | null;
  nextFollowUpOn: string | null;
  open: boolean;
  /** ISO date-times. */
  loggedAt: string;
  loggedBy: { userId: string; name: string };
  editedAt: string | null;
  editedBy: { userId: string; name: string } | null;
  closedAt: string | null;
  closeReason: FeeFollowUpCloseReason | null;
};

export type FeeFollowUpHistoryResponse = {
  enrollmentId: string;
  remainingPaise: number;
  /** Newest first. */
  items: FeeFollowUpResponse[];
};

export type FeeFollowUpInput = {
  channel: FeeFollowUpChannel;
  note?: string | null;
  nextFollowUpOn?: string | null;
};

export const FEE_FOLLOW_UP_CHANNEL_LABELS: Record<FeeFollowUpChannel, string> =
  {
    phone: "Phone",
    whatsapp_sms: "WhatsApp/SMS",
    in_person: "In person",
    other: "Other",
  };

export const FEE_FOLLOW_UP_CLOSE_REASON_LABELS: Record<
  FeeFollowUpCloseReason,
  string
> = {
  superseded: "Replaced by a newer follow-up",
  done: "Marked done",
  dues_cleared: "Dues paid",
};

export const feeDuesQueries = {
  key: {
    all: ["fee-dues"] as const,
    list: (filter: FeeDuesFilter, sort: FeeDuesSort) =>
      [...feeDuesQueries.key.all, "list", filter, sort] as const,
    followUpsDue: () => [...feeDuesQueries.key.all, "follow-ups-due"] as const,
    history: (enrollmentId: string) =>
      [...feeDuesQueries.key.all, "history", enrollmentId] as const,
  },
  list: (filter: FeeDuesFilter = "all", sort: FeeDuesSort = "amount") =>
    queryOptions({
      queryKey: feeDuesQueries.key.list(filter, sort),
      queryFn: () =>
        apiJson<FeeDuesResponse>(
          `${BASE}/fee-dues?filter=${filter}&sort=${sort}`,
        ),
    }),
  followUpsDue: () =>
    queryOptions({
      queryKey: feeDuesQueries.key.followUpsDue(),
      queryFn: () =>
        apiJson<{ items: FeeFollowUpDueResponse[] }>(
          `${BASE}/fee-follow-ups/due`,
        ),
    }),
  history: (enrollmentId: string) =>
    queryOptions({
      queryKey: feeDuesQueries.key.history(enrollmentId),
      queryFn: () =>
        apiJson<FeeFollowUpHistoryResponse>(
          `${BASE}/enrollments/${enrollmentId}/fee-follow-ups`,
        ),
    }),
};

function post<T>(path: string, body?: unknown): Promise<T> {
  return apiJson<T>(`${BASE}${path}`, {
    method: "POST",
    headers: jsonHeaders,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

export function logFeeFollowUp(
  enrollmentId: string,
  input: FeeFollowUpInput,
): Promise<FeeFollowUpResponse> {
  return post(`/enrollments/${enrollmentId}/fee-follow-ups`, input);
}

export function editFeeFollowUp(
  id: string,
  input: FeeFollowUpInput,
): Promise<FeeFollowUpResponse> {
  return post(`/fee-follow-ups/${id}/edit`, input);
}

export function markFeeFollowUpDone(id: string): Promise<FeeFollowUpResponse> {
  return post(`/fee-follow-ups/${id}/done`);
}
