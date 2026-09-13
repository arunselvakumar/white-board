"use client";

import { useSuspenseQuery } from "@tanstack/react-query";
import { Button } from "@repo/ui/components/button";

import { formatPaiseAsRupees } from "@/lib/money";
import { batchQueries } from "@/src/queries/batches";
import { courseQueries } from "@/src/queries/courses";
import { enrollmentQueries } from "@/src/queries/enrollments";
import { studentQueries } from "@/src/queries/students";

export function ReceiptScreen({ paymentId }: { paymentId: string }) {
  const { data: payment } = useSuspenseQuery(
    enrollmentQueries.receipt(paymentId),
  );
  const { data: enrollment } = useSuspenseQuery(
    enrollmentQueries.detail(payment.enrollmentId),
  );
  const { data: student } = useSuspenseQuery(
    studentQueries.detail(enrollment.studentId),
  );
  const { data: course } = useSuspenseQuery(
    courseQueries.detail(enrollment.courseId),
  );
  const { data: batch } = useSuspenseQuery(
    batchQueries.detail(enrollment.batchId),
  );

  return (
    <div className="mx-auto flex w-full max-w-lg flex-col gap-6 p-6 print:p-0">
      <div className="space-y-1 print:hidden">
        <h1 className="text-2xl tracking-tight">Receipt</h1>
        <Button
          type="button"
          onClick={() => {
            window.print();
          }}
        >
          Print Receipt
        </Button>
      </div>
      <div className="bg-background space-y-3 rounded-lg border p-6">
        <h2 className="text-xl tracking-tight">Receipt {payment.receiptNumber}</h2>
        <p>Student: {student.name}</p>
        <p>
          Course: {course.name} · Batch: {batch.name}
        </p>
        <p>Amount: {formatPaiseAsRupees(payment.amountPaise)}</p>
        <p className="capitalize">Method: {payment.method}</p>
        <p>Paid at: {new Date(payment.paidAt).toLocaleString("en-IN")}</p>
        <p>
          Remaining dues: {formatPaiseAsRupees(enrollment.remainingDuesPaise)}
        </p>
      </div>
    </div>
  );
}
