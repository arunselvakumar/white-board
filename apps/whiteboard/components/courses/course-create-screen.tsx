"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";

import { PageHeader } from "@/components/app-shell/page-header";
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
    <div className="w-full p-6">
      <div className="flex max-w-4xl flex-col gap-6">
        <PageHeader
          back={{ href: "/courses", label: "Courses" }}
          title="Add Course"
        />
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
    </div>
  );
}
