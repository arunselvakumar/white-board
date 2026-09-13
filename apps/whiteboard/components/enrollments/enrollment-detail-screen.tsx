"use client";

import { useState } from "react";
import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@repo/ui/components/alert-dialog";
import { Badge } from "@repo/ui/components/badge";
import { Button } from "@repo/ui/components/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/ui/components/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@repo/ui/components/table";

import { CollectPaymentForm } from "@/components/enrollments/collect-payment-form";
import { EnrollmentSettingsForm } from "@/components/enrollments/enrollment-settings-form";
import { FeePlanForm } from "@/components/enrollments/fee-plan-form";
import { classModeLabel, formatTimingSlots } from "@/lib/class-mode";
import { formatPaiseAsRupees } from "@/lib/money";
import { batchQueries } from "@/src/queries/batches";
import { courseQueries } from "@/src/queries/courses";
import {
  adjustFeePlan,
  endEnrollment,
  enrollmentQueries,
  moveEnrollment,
  overrideEnrollmentMode,
  recordFeePayment,
  setEnrollmentTimings,
} from "@/src/queries/enrollments";
import { invalidateRegisterQueries } from "@/src/queries/invalidate-register";
import { studentQueries } from "@/src/queries/students";

export function EnrollmentDetailScreen({
  enrollmentId,
}: {
  enrollmentId: string;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [pendingEnd, setPendingEnd] = useState(false);
  const [moveBatchId, setMoveBatchId] = useState<string | null>(null);
  const { data: enrollment } = useSuspenseQuery(
    enrollmentQueries.detail(enrollmentId),
  );
  const { data: payments } = useSuspenseQuery(
    enrollmentQueries.payments(enrollmentId),
  );
  const { data: student } = useSuspenseQuery(
    studentQueries.detail(enrollment.studentId),
  );
  const { data: batch } = useSuspenseQuery(
    batchQueries.detail(enrollment.batchId),
  );
  const { data: course } = useSuspenseQuery(
    courseQueries.detail(enrollment.courseId),
  );
  const { data: batches } = useSuspenseQuery(
    batchQueries.list({ courseId: enrollment.courseId }),
  );
  const pay = useMutation({
    mutationFn: (input: Parameters<typeof recordFeePayment>[1]) =>
      recordFeePayment(enrollmentId, input),
    onSuccess: async () => {
      await invalidateRegisterQueries(queryClient);
    },
  });
  const saveMode = useMutation({
    mutationFn: (
      classModeOverride: "offline" | "online" | "hybrid" | null,
    ) => overrideEnrollmentMode(enrollmentId, classModeOverride),
    onSuccess: async () => {
      await invalidateRegisterQueries(queryClient);
    },
  });
  const saveTimings = useMutation({
    mutationFn: (input: Parameters<typeof setEnrollmentTimings>[1]) =>
      setEnrollmentTimings(enrollmentId, input),
    onSuccess: async () => {
      await invalidateRegisterQueries(queryClient);
    },
  });
  const saveFeePlan = useMutation({
    mutationFn: (input: Parameters<typeof adjustFeePlan>[1]) =>
      adjustFeePlan(enrollmentId, input),
    onSuccess: async () => {
      await invalidateRegisterQueries(queryClient);
    },
  });
  const move = useMutation({
    mutationFn: (batchId: string) => moveEnrollment(enrollmentId, batchId),
    onSuccess: async () => {
      await invalidateRegisterQueries(queryClient);
      setMoveBatchId(null);
    },
  });
  const end = useMutation({
    mutationFn: () => endEnrollment(enrollmentId),
    onSuccess: async () => {
      await invalidateRegisterQueries(queryClient);
      router.push(`/students/${enrollment.studentId}`);
    },
  });
  const ended = enrollment.endedAt != null;
  const latestPayment = payments.items[0];
  const otherBatches = batches.items.filter(
    (item) => item.id !== enrollment.batchId && item.closedAt == null,
  );
  const otherBatchItems = otherBatches.map((item) => ({
    value: item.id,
    label: item.name,
  }));

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-2xl tracking-tight">Enrollment</h1>
          <p className="text-muted-foreground text-sm">
            {student.name} · {course.name} · {batch.name}
          </p>
        </div>
        {ended ? (
          <Badge variant="secondary">Ended</Badge>
        ) : (
          <Badge variant="outline">Active</Badge>
        )}
      </div>
      <div className="grid gap-2 text-sm">
        <p>
          Class Mode:{" "}
          {enrollment.classModeOverride == null
            ? `Inherit Batch (${classModeLabel(batch.classMode)})`
            : classModeLabel(enrollment.classModeOverride)}
        </p>
        <p>
          Fee Plan: {formatPaiseAsRupees(enrollment.feePlanAmountPaise)}
          {enrollment.feePlanConcessionPaise > 0
            ? ` · concession ${formatPaiseAsRupees(enrollment.feePlanConcessionPaise)}`
            : ""}
          {` · ${enrollment.feePlanType.replace("_", "-")}`}
        </p>
        <p>Remaining dues: {formatPaiseAsRupees(enrollment.remainingDuesPaise)}</p>
        <p>
          Timings:{" "}
          {enrollment.timingSource === "batch"
            ? `Inherit Batch (${formatTimingSlots(batch.timings)})`
            : formatTimingSlots(enrollment.studentTimings ?? [])}
        </p>
      </div>
      {ended ? null : (
        <>
          <div className="space-y-3">
            <h2 className="text-lg tracking-tight">Class Mode and Timings</h2>
            <EnrollmentSettingsForm
              key={`${enrollment.classModeOverride}-${enrollment.timingSource}`}
              enrollment={enrollment}
              onSaveMode={async (classModeOverride) => {
                await saveMode.mutateAsync(classModeOverride);
              }}
              onSaveTimings={async (input) => {
                await saveTimings.mutateAsync(input);
              }}
            />
          </div>
          <div className="space-y-3">
            <h2 className="text-lg tracking-tight">Fee Plan</h2>
            <FeePlanForm
              key={`${enrollment.feePlanType}-${enrollment.feePlanAmountPaise}-${enrollment.feePlanConcessionPaise}`}
              enrollment={enrollment}
              onSubmit={async (input) => {
                await saveFeePlan.mutateAsync(input);
              }}
            />
          </div>
        </>
      )}
      {ended || enrollment.remainingDuesPaise === 0 ? null : (
        <div className="space-y-3">
          <h2 className="text-lg tracking-tight">Collect Fee Payment</h2>
          <CollectPaymentForm
            onSubmit={async (input) => {
              const payment = await pay.mutateAsync(input);
              router.push(`/payments/${payment.id}/receipt`);
            }}
          />
        </div>
      )}
      <div className="space-y-3">
        <h2 className="text-lg tracking-tight">Fee Payments</h2>
        {payments.items.length === 0 ? (
          <p className="text-muted-foreground text-sm">No Fee Payments yet.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Receipt</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Method</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {payments.items.map((payment) => (
                <TableRow key={payment.id}>
                  <TableCell>{payment.receiptNumber}</TableCell>
                  <TableCell>
                    {formatPaiseAsRupees(payment.amountPaise)}
                  </TableCell>
                  <TableCell className="capitalize">{payment.method}</TableCell>
                  <TableCell className="text-right">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        router.push(`/payments/${payment.id}/receipt`);
                      }}
                    >
                      Receipt
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
      {ended || otherBatches.length === 0 ? null : (
        <div className="space-y-3">
          <h2 className="text-lg tracking-tight">Move to another Batch</h2>
          <Select
            items={otherBatchItems}
            value={moveBatchId}
            onValueChange={(value) => {
              if (value == null) return;
              setMoveBatchId(value);
            }}
          >
            <SelectTrigger
              id="moveBatchId"
              size="lg"
              className="w-full min-w-0"
              aria-label="Move to Batch"
            >
              <SelectValue placeholder="Select a Batch of this Course" />
            </SelectTrigger>
            <SelectContent align="start" alignItemWithTrigger={false}>
              {otherBatchItems.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            type="button"
            disabled={moveBatchId == null || move.isPending}
            onClick={() => {
              if (moveBatchId == null) return;
              move.mutate(moveBatchId);
            }}
          >
            Move Enrollment
          </Button>
        </div>
      )}
      {ended ? null : (
        <Button
          type="button"
          variant="ghost"
          onClick={() => {
            setPendingEnd(true);
          }}
        >
          End Enrollment
        </Button>
      )}
      {latestPayment == null ? null : (
        <p className="text-muted-foreground text-sm">
          Latest Receipt {latestPayment.receiptNumber}
        </p>
      )}
      <AlertDialog open={pendingEnd} onOpenChange={setPendingEnd}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>End this Enrollment?</AlertDialogTitle>
            <AlertDialogDescription>
              {student.name} leaves the {batch.name} register. Fee Payments stay.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <Button
              type="button"
              onClick={() => {
                setPendingEnd(false);
                end.mutate();
              }}
            >
              End Enrollment
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
