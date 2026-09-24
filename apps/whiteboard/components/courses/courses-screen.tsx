"use client";

import { useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";

import { CourseCatalog } from "@/components/courses/course-catalog";
import {
  archiveCourse,
  courseQueries,
} from "@/src/queries/courses";

export function CoursesScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data } = useSuspenseQuery(courseQueries.list());
  const archive = useMutation({
    mutationFn: (id: string) => archiveCourse(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: courseQueries.key.all });
    },
  });

  return (
    <CourseCatalog
      courses={data.items}
      onAdd={() => {
        router.push("/courses/new");
      }}
      onEdit={(course) => {
        router.push(`/courses/${course.id}`);
      }}
      onArchive={(course) => {
        archive.mutate(course.id);
      }}
    />
  );
}
