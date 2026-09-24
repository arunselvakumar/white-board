"use client";

import { useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { Badge } from "@repo/ui/components/badge";
import { Button } from "@repo/ui/components/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@repo/ui/components/table";

import {
  BatchForm,
  batchToFormValues,
} from "@/components/batches/batch-form";
import { batchQueries, updateBatchSchedule } from "@/src/queries/batches";
import { courseQueries } from "@/src/queries/courses";
import { enrollmentQueries } from "@/src/queries/enrollments";
import { studentQueries } from "@/src/queries/students";

export function BatchEditScreen({ batchId }: { batchId: string }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data: batch } = useSuspenseQuery(batchQueries.detail(batchId));
  const { data: courses } = useSuspenseQuery(courseQueries.list());
  const { data: enrollments } = useSuspenseQuery(
    enrollmentQueries.list({ batchId }),
  );
  const { data: students } = useSuspenseQuery(studentQueries.list());
  const update = useMutation({
    mutationFn: (input: Parameters<typeof updateBatchSchedule>[1]) =>
      updateBatchSchedule(batchId, input),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: batchQueries.key.all });
      router.push("/batches");
    },
  });
  const course = courses.items.find((item) => item.id === batch.courseId);
  const studentNameById = new Map(
    students.items.map((student) => [student.id, student.name]),
  );
  const roster = enrollments.items.filter(
    (enrollment) => enrollment.endedAt == null,
  );

  return (
    <div className="flex w-full max-w-lg flex-col gap-6 p-6">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl tracking-tight">Edit Batch</h1>
        {batch.closedAt == null ? (
          <Button
            type="button"
            onClick={() => {
              router.push(`/batches/${batchId}/enroll`);
            }}
          >
            Enroll Student
          </Button>
        ) : null}
      </div>
      <section className="space-y-3">
        <h2 className="text-lg tracking-tight">Enrolled Students</h2>
        <p className="text-muted-foreground text-sm">
          {roster.length}/{batch.capacity} seats filled
        </p>
        {roster.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            No Students enrolled in this Batch yet.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Student</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {roster.map((enrollment) => (
                <TableRow key={enrollment.id}>
                  <TableCell className="font-medium">
                    {studentNameById.get(enrollment.studentId) ?? "Student"}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">Active</Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        router.push(`/enrollments/${enrollment.id}`);
                      }}
                    >
                      Open
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </section>
      <BatchForm
        lockCourse
        courses={
          course == null ? [] : [{ id: course.id, name: course.name }]
        }
        defaultValues={batchToFormValues(batch)}
        submitLabel="Save Batch"
        onCancel={() => {
          router.push("/batches");
        }}
        onSubmit={async (input) => {
          await update.mutateAsync(input);
        }}
      />
    </div>
  );
}
