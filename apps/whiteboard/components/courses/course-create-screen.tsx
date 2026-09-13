"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";

import { CourseForm } from "@/components/courses/course-form";
import { createCourse, courseQueries } from "@/src/queries/courses";

export function CourseCreateScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const create = useMutation({
    mutationFn: createCourse,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: courseQueries.key.all });
      router.push("/courses");
    },
  });

  return (
    <div className="mx-auto flex w-full max-w-lg flex-col gap-6 p-6">
      <h1 className="text-2xl tracking-tight">Add Course</h1>
      <CourseForm
        submitLabel="Save Course"
        onCancel={() => {
          router.push("/courses");
        }}
        onSubmit={async (input) => {
          await create.mutateAsync(input);
        }}
      />
    </div>
  );
}
