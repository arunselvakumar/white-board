"use client";

import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { Badge } from "@repo/ui/components/badge";
import { Button } from "@repo/ui/components/button";

import {
  StudentForm,
  studentToFormValues,
} from "@/components/students/student-form";
import { formatPaiseAsRupees } from "@/lib/money";
import { batchQueries } from "@/src/queries/batches";
import { courseQueries } from "@/src/queries/courses";
import { studentQueries, updateStudentProfile } from "@/src/queries/students";

export function StudentEditScreen({ studentId }: { studentId: string }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data: student } = useSuspenseQuery(studentQueries.detail(studentId));
  const { data: courses } = useSuspenseQuery(courseQueries.list());
  const { data: batches } = useSuspenseQuery(batchQueries.list());
  const courseNameById = new Map(
    courses.items.map((course) => [course.id, course.name]),
  );
  const batchNameById = new Map(
    batches.items.map((batch) => [batch.id, batch.name]),
  );
  const update = useMutation({
    mutationFn: (input: Parameters<typeof updateStudentProfile>[1]) =>
      updateStudentProfile(studentId, input),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: studentQueries.key.all });
      router.push(`/students/${studentId}`);
    },
  });
  const enrollments = student.enrollments ?? [];

  return (
    <div className="w-full">
      <StudentForm
        defaultValues={studentToFormValues(student)}
        submitLabel="Save Student"
        onCancel={() => {
          router.push(`/students/${studentId}`);
        }}
        onSubmit={async (input) => {
          await update.mutateAsync(input);
        }}
      />
      <div className="max-w-4xl space-y-3 px-4 pb-8 sm:px-6">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg tracking-tight">Enrollments</h2>
          <Button
            type="button"
            onClick={() => {
              router.push(`/students/${studentId}/enroll`);
            }}
          >
            Enroll
          </Button>
        </div>
        {enrollments.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            This Student is not on a Batch yet.
          </p>
        ) : (
          <ul className="space-y-2">
            {enrollments.map((enrollment) => (
              <li
                key={enrollment.id}
                className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2"
              >
                <div className="space-y-1">
                  <p className="text-sm font-medium">
                    {courseNameById.get(enrollment.courseId) ?? "Course"} ·{" "}
                    {batchNameById.get(enrollment.batchId) ?? "Batch"}
                  </p>
                  <p className="text-muted-foreground text-sm">
                    Remaining dues{" "}
                    {formatPaiseAsRupees(enrollment.remainingDuesPaise)}
                  </p>
                  {enrollment.endedAt == null ? (
                    <Badge variant="outline">Active</Badge>
                  ) : (
                    <Badge variant="secondary">Ended</Badge>
                  )}
                </div>
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
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
