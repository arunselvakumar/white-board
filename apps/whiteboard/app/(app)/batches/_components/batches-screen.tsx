"use client";

import { useState } from "react";
import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { useRouter } from "next/navigation";

import { BatchCatalog } from "@/components/batches/batch-catalog";
import {
  batchQueries,
  closeBatch,
  type BatchListFilters,
} from "@/src/queries/batches";
import { courseQueries } from "@/src/queries/courses";
import { calendarQueries } from "@/src/queries/calendar";

const PAGE_SIZE = 12;

export function BatchesScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [courseId, setCourseId] = useState("all");
  const [page, setPage] = useState(1);
  const [cursor, setCursor] =
    useState<Pick<BatchListFilters, "after" | "before">>();
  const { data: courses } = useSuspenseQuery(courseQueries.list());
  const {
    data: batches,
    isPending,
    isPlaceholderData,
    isError,
    refetch,
  } = useQuery({
    ...batchQueries.list({
      ...(courseId === "all" ? {} : { courseId }),
      limit: PAGE_SIZE,
      ...cursor,
    }),
    placeholderData: keepPreviousData,
  });
  const close = useMutation({
    mutationFn: (id: string) => closeBatch(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: batchQueries.key.all });
      await queryClient.invalidateQueries({
        queryKey: calendarQueries.key.all,
      });
    },
  });

  return (
    <BatchCatalog
      batches={batches?.items ?? []}
      loading={isPending || isPlaceholderData}
      loadError={isError && batches == null}
      onRetry={() => {
        void refetch();
      }}
      courses={courses.items
        .filter((course) => course.archivedAt == null)
        .map((course) => ({ id: course.id, name: course.name }))}
      courseId={courseId}
      onCourseIdChange={(value) => {
        setCourseId(value);
        setCursor(undefined);
        setPage(1);
      }}
      pagination={{
        total: batches?.total ?? 0,
        page,
        pageSize: PAGE_SIZE,
        hasNext: batches?.nextCursor != null,
        hasPrevious: batches?.prevCursor != null,
        onNext: () => {
          if (batches?.nextCursor == null) return;
          setCursor({ after: batches.nextCursor });
          setPage((current) => current + 1);
        },
        onPrevious: () => {
          if (batches?.prevCursor == null) return;
          setCursor({ before: batches.prevCursor });
          setPage((current) => current - 1);
        },
      }}
      onAdd={() => {
        router.push("/batches/new");
      }}
      onAddCourse={() => {
        router.push("/courses/new");
      }}
      onEdit={(batch) => {
        router.push(`/batches/${batch.id}`);
      }}
      onClose={(batch) => {
        close.mutate(batch.id);
      }}
    />
  );
}
