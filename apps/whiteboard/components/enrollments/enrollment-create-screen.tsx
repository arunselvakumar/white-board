"use client";

import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { useRouter } from "next/navigation";

import { PageHeader } from "@/components/app-shell/page-header";
import { EnrollmentForm } from "@/components/enrollments/enrollment-form";
import { studentFullName } from "@/components/students/student-profile-view";
import { batchQueries } from "@/src/queries/batches";
import { enrollmentQueries, enrollStudent } from "@/src/queries/enrollments";
import { invalidateRegisterQueries } from "@/src/queries/invalidate-register";
import { studentQueries } from "@/src/queries/students";

export function EnrollmentCreateScreen({
  studentId,
  batchId,
}: {
  studentId?: string;
  batchId?: string;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data: students } = useSuspenseQuery(studentQueries.list());
  const { data: batches } = useSuspenseQuery(batchQueries.list());
  const { data: existingEnrollments } = useSuspenseQuery(
    enrollmentQueries.list(
      studentId != null
        ? { studentId }
        : batchId != null
          ? { batchId }
          : undefined,
    ),
  );
  const create = useMutation({
    mutationFn: enrollStudent,
    onSuccess: async () => {
      await invalidateRegisterQueries(queryClient);
      if (studentId != null) {
        router.push(`/students/${studentId}`);
        return;
      }
      if (batchId != null) {
        router.push(`/batches/${batchId}`);
        return;
      }
      router.push("/students");
    },
  });
  const activeExisting = existingEnrollments.items.filter(
    (enrollment) => enrollment.endedAt == null,
  );
  const enrolledStudentIds = new Set(
    activeExisting.map((enrollment) => enrollment.studentId),
  );
  const enrolledBatchIds = new Set(
    activeExisting.map((enrollment) => enrollment.batchId),
  );
  const openBatches = batches.items.filter(
    (batch) =>
      batch.closedAt == null &&
      (studentId == null || !enrolledBatchIds.has(batch.id)),
  );
  const activeStudents = students.items.filter(
    (student) =>
      student.droppedAt == null &&
      (batchId == null || !enrolledStudentIds.has(student.id)),
  );

  const student = students.items.find((item) => item.id === studentId);
  const batch = batches.items.find((item) => item.id === batchId);
  const back =
    student != null
      ? { href: `/students/${student.id}`, label: studentFullName(student) }
      : batch != null
        ? { href: `/batches/${batch.id}`, label: batch.name }
        : { href: "/students", label: "Students" };

  return (
    <div className="w-full p-6">
      <div className="flex max-w-4xl flex-col gap-6">
        <PageHeader back={back} title="Enroll Student" />
        <EnrollmentForm
          lockStudent={studentId != null}
          lockBatch={batchId != null}
          students={activeStudents.map((student) => ({
            id: student.id,
            name: student.name,
          }))}
          batches={openBatches.map((batch) => ({
            id: batch.id,
            name: batch.name,
          }))}
          defaultValues={{
            studentId: studentId ?? "",
            batchId: batchId ?? "",
          }}
          submitLabel="Save Enrollment"
          onCancel={() => {
            if (studentId != null) {
              router.push(`/students/${studentId}`);
              return;
            }
            if (batchId != null) {
              router.push(`/batches/${batchId}`);
              return;
            }
            router.push("/students");
          }}
          onSubmit={async (input) => {
            await create.mutateAsync(input);
          }}
        />
      </div>
    </div>
  );
}
