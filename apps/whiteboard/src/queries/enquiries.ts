import { queryOptions } from "@tanstack/react-query";

import type { TimingSlot } from "./batches";
import { apiJson } from "./http";

export type ClassModeValue = "offline" | "online" | "hybrid";

export type EnquiryStage =
  | "new"
  | "follow_up"
  | "demo_scheduled"
  | "demo_attended"
  | "joined"
  | "not_interested";

export type EnquiryListView = "due" | "open" | "closed" | "all";

export type EnquirySource = {
  id: string;
  name: string;
  retired: boolean;
};

export type EnquiryResponse = {
  id: string;
  prospectName: string;
  phone: string;
  email: string | null;
  guardianName: string | null;
  guardianPhone: string | null;
  courseId: string | null;
  courseName: string | null;
  subject: string | null;
  preferredClassMode: ClassModeValue | null;
  preferredTiming: string | null;
  source: EnquirySource | null;
  notes: string | null;
  stage: EnquiryStage;
  nextFollowUpOn: string | null;
  /** Open, and the next follow-up date is today or earlier (Asia/Kolkata). */
  followUpDue: boolean;
  notInterestedReason: string | null;
  convertedStudentId: string | null;
  convertedEnrollmentId: string | null;
  convertedAt: string | null;
  createdByUserId: string;
  createdAt: string;
  updatedAt: string;
};

export type EnquiryListResponse = {
  items: EnquiryResponse[];
  nextCursor: string | null;
  prevCursor: string | null;
  total: number;
};

export type EnquiryActivityKind =
  | "created"
  | "follow_up"
  | "not_interested"
  | "reopened"
  | "joined"
  | "details_updated";

export type EnquiryActivity = {
  id: string;
  kind: EnquiryActivityKind;
  note: string | null;
  nextFollowUpOn: string | null;
  createdByUserId: string;
  createdAt: string;
};

export type DemoAttendance = "unmarked" | "attended" | "missed";

export type DemoResponse = {
  id: string;
  enquiryId: string;
  prospectName: string;
  /** The Course name, else the free-text subject, of the Enquiry. */
  enquiryInterest: string | null;
  kind: "batch" | "one_to_one";
  batchId: string | null;
  batchName: string | null;
  /** The Batch's Course for a Batch demo; null for one-to-one. */
  courseName: string | null;
  teacherId: string | null;
  teacherName: string | null;
  date: string;
  startTime: string;
  endTime: string;
  timezone: string;
  feeKind: "free" | "paid";
  feeAmountPaise: number | null;
  feePaidAt: string | null;
  attendance: DemoAttendance;
  attendanceMarkedAt: string | null;
  cancelledAt: string | null;
  createdByUserId: string;
  createdAt: string;
};

export type EnquiryDetailResponse = EnquiryResponse & {
  /** Newest first. */
  history: EnquiryActivity[];
  /** Ordered by date, then start time. Includes cancelled demos. */
  demos: DemoResponse[];
};

export type EnquiryInput = {
  prospectName: string;
  phone: string;
  email?: string | null;
  guardianName?: string | null;
  guardianPhone?: string | null;
  courseId?: string | null;
  subject?: string | null;
  preferredClassMode?: ClassModeValue | null;
  preferredTiming?: string | null;
  sourceId?: string | null;
  notes?: string | null;
};

export type CreateEnquiryInput = EnquiryInput & {
  nextFollowUpOn?: string | null;
};

export type BookDemoInput =
  | {
      kind: "batch";
      batchId: string;
      date: string;
      startTime: string;
      feeKind: "free" | "paid";
      feeAmountPaise?: number | null;
    }
  | {
      kind: "one_to_one";
      teacherId: string;
      date: string;
      startTime: string;
      endTime: string;
      feeKind: "free" | "paid";
      feeAmountPaise?: number | null;
    };

export type ConvertEnquiryInput = {
  batchId: string;
  timingSource: "batch" | "student";
  studentTimings?: TimingSlot[];
  classModeOverride?: ClassModeValue | null;
};

export type ConvertEnquiryResponse = {
  enquiry: EnquiryResponse;
  studentId: string;
  enrollmentId: string;
};

export type PhoneMatchesResponse = {
  enquiries: { id: string; prospectName: string; stage: EnquiryStage }[];
  students: { id: string; name: string }[];
};

export type EnquiryOptionsResponse = {
  courses: { id: string; name: string }[];
  batches: {
    id: string;
    name: string;
    courseId: string;
    courseName: string;
    classMode: ClassModeValue;
    timezone: string;
    capacity: number;
    enrolled: number;
  }[];
  teachers: { id: string; name: string }[];
  /** Includes retired Sources; offer only active ones for new choices. */
  sources: EnquirySource[];
  /** The caller's own Teacher id when they are a Teacher, else null. */
  currentTeacherId: string | null;
};

export type EnquirySummaryResponse = {
  month: string;
  enquiriesReceived: number;
  demosAttended: number;
  admissions: number;
  paidDemoFeesPaise: number;
  /** Top 5, most frequent first. */
  notInterestedReasons: { reason: string; count: number }[];
  /** Most admissions first, then most Enquiries. `sourceId` null = no Source. */
  sources: {
    sourceId: string | null;
    name: string;
    enquiries: number;
    admissions: number;
  }[];
};

export type DemoSlot = {
  date: string;
  startTime: string;
  endTime: string;
  status: "scheduled" | "cancelled" | "moved" | "holiday";
  rescheduled: boolean;
  reason: string | null;
  /** Scheduled, and its start time hasn't passed. */
  bookable: boolean;
};

export type DemoSlotsResponse = { items: DemoSlot[] };

export type DemoListResponse = { items: DemoResponse[] };

export type EnquiryListFilters = {
  view?: EnquiryListView;
  q?: string;
  limit?: number;
  after?: string;
  before?: string;
};

const BASE = "/api/training-institute";
const jsonHeaders = { "content-type": "application/json" };

function post<T>(path: string, body: unknown = {}): Promise<T> {
  return apiJson<T>(`${BASE}${path}`, {
    method: "POST",
    headers: jsonHeaders,
    body: JSON.stringify(body),
  });
}

export const enquiryQueries = {
  key: {
    all: ["enquiries"] as const,
    list: (filters?: EnquiryListFilters) =>
      [...enquiryQueries.key.all, "list", filters] as const,
    detail: (id: string) => [...enquiryQueries.key.all, "detail", id] as const,
    options: () => [...enquiryQueries.key.all, "options"] as const,
    summary: (month: string) =>
      [...enquiryQueries.key.all, "summary", month] as const,
    sources: () => [...enquiryQueries.key.all, "sources"] as const,
    demos: (from: string, to: string) =>
      [...enquiryQueries.key.all, "demos", from, to] as const,
    demoSlots: (batchId: string, date: string) =>
      [...enquiryQueries.key.all, "demo-slots", batchId, date] as const,
  },
  list: (filters?: EnquiryListFilters) =>
    queryOptions({
      queryKey: enquiryQueries.key.list(filters),
      queryFn: () => {
        const params = new URLSearchParams();
        if (filters?.view) params.set("view", filters.view);
        if (filters?.q) params.set("q", filters.q);
        if (filters?.limit) params.set("limit", String(filters.limit));
        if (filters?.after) params.set("after", filters.after);
        if (filters?.before) params.set("before", filters.before);
        const query = params.size > 0 ? `?${params.toString()}` : "";
        return apiJson<EnquiryListResponse>(`${BASE}/enquiries${query}`);
      },
    }),
  detail: (id: string) =>
    queryOptions({
      queryKey: enquiryQueries.key.detail(id),
      queryFn: () => apiJson<EnquiryDetailResponse>(`${BASE}/enquiries/${id}`),
    }),
  options: () =>
    queryOptions({
      queryKey: enquiryQueries.key.options(),
      queryFn: () =>
        apiJson<EnquiryOptionsResponse>(`${BASE}/enquiries/options`),
    }),
  summary: (month: string) =>
    queryOptions({
      queryKey: enquiryQueries.key.summary(month),
      queryFn: () =>
        apiJson<EnquirySummaryResponse>(
          `${BASE}/enquiries/summary?month=${encodeURIComponent(month)}`,
        ),
    }),
  sources: () =>
    queryOptions({
      queryKey: enquiryQueries.key.sources(),
      queryFn: () =>
        apiJson<{ items: EnquirySource[] }>(`${BASE}/enquiry-sources`),
    }),
  demos: (from: string, to: string) =>
    queryOptions({
      queryKey: enquiryQueries.key.demos(from, to),
      queryFn: () =>
        apiJson<DemoListResponse>(
          `${BASE}/demos?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
        ),
    }),
  demoSlots: (batchId: string, date: string) =>
    queryOptions({
      queryKey: enquiryQueries.key.demoSlots(batchId, date),
      queryFn: () =>
        apiJson<DemoSlotsResponse>(
          `${BASE}/demos/slots?batchId=${encodeURIComponent(batchId)}&date=${encodeURIComponent(date)}`,
        ),
    }),
};

export function createEnquiry(
  input: CreateEnquiryInput,
): Promise<EnquiryResponse> {
  return post("/enquiries", input);
}

export function updateEnquiryDetails(
  id: string,
  input: EnquiryInput,
): Promise<EnquiryResponse> {
  return post(`/enquiries/${id}/details`, input);
}

export function logEnquiryFollowUp(
  id: string,
  input: { note: string; nextFollowUpOn: string | null },
): Promise<EnquiryDetailResponse> {
  return post(`/enquiries/${id}/follow-ups`, input);
}

export function markEnquiryNotInterested(
  id: string,
  reason: string,
): Promise<EnquiryResponse> {
  return post(`/enquiries/${id}/not-interested`, { reason });
}

export function reopenEnquiry(
  id: string,
  nextFollowUpOn: string | null = null,
): Promise<EnquiryResponse> {
  return post(`/enquiries/${id}/reopen`, { nextFollowUpOn });
}

export function convertEnquiry(
  id: string,
  input: ConvertEnquiryInput,
): Promise<ConvertEnquiryResponse> {
  return post(`/enquiries/${id}/convert`, input);
}

export function findPhoneMatches(
  phone: string,
  excludeEnquiryId?: string,
): Promise<PhoneMatchesResponse> {
  return post("/enquiries/phone-matches", { phone, excludeEnquiryId });
}

export function bookDemo(
  enquiryId: string,
  input: BookDemoInput,
): Promise<DemoResponse> {
  return post(`/enquiries/${enquiryId}/demos`, input);
}

export function markDemoAttendance(
  demoId: string,
  attended: boolean,
): Promise<DemoResponse> {
  return post(`/demos/${demoId}/attendance`, { attended });
}

export function markDemoFeePaid(demoId: string): Promise<DemoResponse> {
  return post(`/demos/${demoId}/fee-paid`);
}

export function cancelDemo(demoId: string): Promise<DemoResponse> {
  return post(`/demos/${demoId}/cancel`);
}

export function addEnquirySource(name: string): Promise<EnquirySource> {
  return post("/enquiry-sources", { name });
}

export function renameEnquirySource(
  id: string,
  name: string,
): Promise<EnquirySource> {
  return post(`/enquiry-sources/${id}/rename`, { name });
}

export function retireEnquirySource(id: string): Promise<EnquirySource> {
  return post(`/enquiry-sources/${id}/retire`);
}

export function restoreEnquirySource(id: string): Promise<EnquirySource> {
  return post(`/enquiry-sources/${id}/restore`);
}

export const ENQUIRY_STAGE_LABELS: Record<EnquiryStage, string> = {
  new: "New",
  follow_up: "Follow-up due",
  demo_scheduled: "Demo scheduled",
  demo_attended: "Demo attended",
  joined: "Joined",
  not_interested: "Not interested",
};
