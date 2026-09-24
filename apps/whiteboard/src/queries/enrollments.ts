import { queryOptions } from "@tanstack/react-query";

import { apiJson } from "./http";
import type { TimingSlot } from "./batches";

export type EnrollmentResponse = {
  id: string;
  studentId: string;
  courseId: string;
  batchId: string;
  classModeOverride: "offline" | "online" | "hybrid" | null;
  timingSource: "batch" | "student";
  studentTimings: TimingSlot[] | null;
  endedAt: string | null;
  feePlanType: "one_time" | "monthly" | "installments";
  feePlanAmountPaise: number;
  feePlanConcessionPaise: number;
  feePlanInstallmentCount: number | null;
  feePlanDueDates: { dueOn: string; amountPaise: number }[];
  remainingDuesPaise: number;
  createdAt: string;
  updatedAt: string;
  createdByUserId: string;
};

export type EnrollmentListResponse = {
  items: EnrollmentResponse[];
  nextCursor: string | null;
  prevCursor: string | null;
  total: number;
};

export type EnrollInput = {
  studentId: string;
  batchId: string;
  classModeOverride?: "offline" | "online" | "hybrid" | null;
  timingSource: "batch" | "student";
  studentTimings?: TimingSlot[];
};

export type FeePaymentResponse = {
  id: string;
  enrollmentId: string;
  amountPaise: number;
  method: "cash" | "upi" | "card" | "other";
  paidAt: string;
  receiptNumber: string;
  recordedByUserId: string;
  createdAt: string;
};

export type FeePaymentListResponse = {
  items: FeePaymentResponse[];
  nextCursor: string | null;
  prevCursor: string | null;
  total: number;
};

const jsonHeaders = { "content-type": "application/json" };

export const enrollmentQueries = {
  key: {
    all: ["enrollments"] as const,
    list: (filters?: { studentId?: string; batchId?: string }) =>
      [...enrollmentQueries.key.all, "list", filters] as const,
    detail: (id: string) =>
      [...enrollmentQueries.key.all, "detail", id] as const,
    payments: (id: string) =>
      [...enrollmentQueries.key.all, "payments", id] as const,
    receipt: (id: string) =>
      [...enrollmentQueries.key.all, "receipt", id] as const,
  },
  list: (filters?: { studentId?: string; batchId?: string }) =>
    queryOptions({
      queryKey: enrollmentQueries.key.list(filters),
      queryFn: () => {
        const params = new URLSearchParams({ limit: "100" });
        if (filters?.studentId) params.set("studentId", filters.studentId);
        if (filters?.batchId) params.set("batchId", filters.batchId);
        return apiJson<EnrollmentListResponse>(
          `/api/enrollments?${params.toString()}`,
        );
      },
    }),
  detail: (id: string) =>
    queryOptions({
      queryKey: enrollmentQueries.key.detail(id),
      queryFn: () => apiJson<EnrollmentResponse>(`/api/enrollments/${id}`),
    }),
  payments: (id: string) =>
    queryOptions({
      queryKey: enrollmentQueries.key.payments(id),
      queryFn: () =>
        apiJson<FeePaymentListResponse>(
          `/api/enrollments/${id}/payments?limit=100`,
        ),
    }),
  receipt: (id: string) =>
    queryOptions({
      queryKey: enrollmentQueries.key.receipt(id),
      queryFn: () => apiJson<FeePaymentResponse>(`/api/payments/${id}/receipt`),
    }),
};

export function enrollStudent(
  input: EnrollInput,
): Promise<EnrollmentResponse> {
  return apiJson<EnrollmentResponse>("/api/enrollments", {
    method: "POST",
    headers: jsonHeaders,
    body: JSON.stringify(input),
  });
}

export function overrideEnrollmentMode(
  id: string,
  classModeOverride: "offline" | "online" | "hybrid" | null,
): Promise<EnrollmentResponse> {
  return apiJson<EnrollmentResponse>(`/api/enrollments/${id}/mode`, {
    method: "POST",
    headers: jsonHeaders,
    body: JSON.stringify({ classModeOverride }),
  });
}

export function setEnrollmentTimings(
  id: string,
  input: { timingSource: "batch" | "student"; studentTimings?: TimingSlot[] },
): Promise<EnrollmentResponse> {
  return apiJson<EnrollmentResponse>(`/api/enrollments/${id}/timings`, {
    method: "POST",
    headers: jsonHeaders,
    body: JSON.stringify(input),
  });
}

export function moveEnrollment(
  id: string,
  batchId: string,
): Promise<EnrollmentResponse> {
  return apiJson<EnrollmentResponse>(`/api/enrollments/${id}/move`, {
    method: "POST",
    headers: jsonHeaders,
    body: JSON.stringify({ batchId }),
  });
}

export function endEnrollment(id: string): Promise<EnrollmentResponse> {
  return apiJson<EnrollmentResponse>(`/api/enrollments/${id}/end`, {
    method: "POST",
  });
}

export function adjustFeePlan(
  id: string,
  input: {
    type: "one_time" | "monthly" | "installments";
    amountPaise: number;
    concessionPaise: number;
    installmentCount?: number | null;
    dueDates: { dueOn: string; amountPaise: number }[];
  },
): Promise<EnrollmentResponse> {
  return apiJson<EnrollmentResponse>(`/api/enrollments/${id}/fee-plan`, {
    method: "POST",
    headers: jsonHeaders,
    body: JSON.stringify(input),
  });
}

export function recordFeePayment(
  enrollmentId: string,
  input: {
    amountPaise: number;
    method: "cash" | "upi" | "card" | "other";
  },
): Promise<FeePaymentResponse> {
  return apiJson<FeePaymentResponse>(
    `/api/enrollments/${enrollmentId}/payments`,
    {
      method: "POST",
      headers: jsonHeaders,
      body: JSON.stringify(input),
    },
  );
}
