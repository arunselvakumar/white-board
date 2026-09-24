"use client";

import { useSuspenseQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";

import { FeesCatalog } from "@/components/fees/fees-catalog";
import { batchQueries } from "@/src/queries/batches";
import { enrollmentQueries } from "@/src/queries/enrollments";
import { studentQueries } from "@/src/queries/students";

export function FeesScreen() {
  const router = useRouter();
  const { data: enrollments } = useSuspenseQuery(enrollmentQueries.list());
  const { data: students } = useSuspenseQuery(studentQueries.list());
  const { data: batches } = useSuspenseQuery(batchQueries.list());
  const studentName = new Map(
    students.items.map((student) => [student.id, student.name]),
  );
  const batchName = new Map(
    batches.items.map((batch) => [batch.id, batch.name]),
  );
  const dues = enrollments.items
    .filter(
      (enrollment) =>
        enrollment.endedAt == null && enrollment.remainingDuesPaise > 0,
    )
    .map((enrollment) => ({
      id: enrollment.id,
      studentName: studentName.get(enrollment.studentId) ?? "Student",
      batchName: batchName.get(enrollment.batchId) ?? "Batch",
      remainingDuesPaise: enrollment.remainingDuesPaise,
    }));

  return (
    <FeesCatalog
      dues={dues}
      onCollect={(id) => {
        router.push(`/enrollments/${id}`);
      }}
      onOpenStudents={() => {
        router.push("/students");
      }}
    />
  );
}
