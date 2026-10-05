"use client";

import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { useRouter } from "next/navigation";

import { PageHeader } from "@/components/app-shell/page-header";
import {
  CourseForm,
  courseToFormValues,
} from "@/components/courses/course-form";
import { courseQueries, updateCourse } from "@/src/queries/courses";
import { calendarQueries } from "@/src/queries/calendar";

export function CourseEditScreen({ courseId }: { courseId: string }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data: course } = useSuspenseQuery(courseQueries.detail(courseId));
  const update = useMutation({
    mutationFn: (input: Parameters<typeof updateCourse>[1]) =>
      updateCourse(courseId, input),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: courseQueries.key.all });
      await queryClient.invalidateQueries({
        queryKey: calendarQueries.key.all,
      });
      router.push("/courses");
    },
  });

  return (
    <div className="w-full p-6">
      <div className="flex w-full max-w-4xl flex-col gap-6">
        <PageHeader
          back={{ href: "/courses", label: "Courses" }}
          title="Edit Course"
          meta={course.name}
        />
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
    </div>
  );
}
