"use client";

import { useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";

import {
  CourseForm,
  courseToFormValues,
} from "@/components/courses/course-form";
import { courseQueries, updateCourse } from "@/src/queries/courses";

export function CourseEditScreen({ courseId }: { courseId: string }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data: course } = useSuspenseQuery(courseQueries.detail(courseId));
  const update = useMutation({
    mutationFn: (input: Parameters<typeof updateCourse>[1]) =>
      updateCourse(courseId, input),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: courseQueries.key.all });
      router.push("/courses");
    },
  });

  return (
    <div className="flex w-full max-w-lg flex-col gap-6 p-6">
      <h1 className="text-2xl tracking-tight">Edit Course</h1>
      <CourseForm
        defaultValues={courseToFormValues(course)}
        submitLabel="Save Course"
        onCancel={() => {
          router.push("/courses");
        }}
        onSubmit={async (input) => {
          await update.mutateAsync(input);
        }}
      />
    </div>
  );
}
