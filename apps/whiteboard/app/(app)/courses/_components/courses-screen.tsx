"use client";

import { useState } from "react";
import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useRouter } from "next/navigation";

import { CourseCatalog } from "@/app/(app)/courses/_components/course-catalog";
import {
  archiveCourse,
  COURSES_PAGE_SIZE as PAGE_SIZE,
  courseQueries,
  type CourseListPage,
} from "@/src/queries/courses";
import { calendarQueries } from "@/src/queries/calendar";


export function CoursesScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [cursor, setCursor] =
    useState<Pick<CourseListPage, "after" | "before">>();
  const { data, isPending, isPlaceholderData, isError, refetch } = useQuery({
    ...courseQueries.list({ limit: PAGE_SIZE, ...cursor }),
    placeholderData: keepPreviousData,
  });
  const archive = useMutation({
    mutationFn: (id: string) => archiveCourse(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: courseQueries.key.all });
      await queryClient.invalidateQueries({
        queryKey: calendarQueries.key.all,
      });
    },
  });

  return (
    <CourseCatalog
      courses={data?.items ?? []}
      loading={isPending || isPlaceholderData}
      loadError={isError && data == null}
      onRetry={() => {
        void refetch();
      }}
      pagination={{
        total: data?.total ?? 0,
        page,
        pageSize: PAGE_SIZE,
        hasNext: data?.nextCursor != null,
        hasPrevious: data?.prevCursor != null,
        onNext: () => {
          if (data?.nextCursor == null) return;
          setCursor({ after: data.nextCursor });
          setPage((current) => current + 1);
        },
        onPrevious: () => {
          if (data?.prevCursor == null) return;
          setCursor({ before: data.prevCursor });
          setPage((current) => current - 1);
        },
      }}
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
