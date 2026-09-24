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
import { batchQueries, closeBatch } from "@/src/queries/batches";
import { courseQueries } from "@/src/queries/courses";

export function BatchesScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [courseId, setCourseId] = useState("all");
  const { data: courses } = useSuspenseQuery(courseQueries.list());
  const { data: batches } = useQuery({
    ...batchQueries.list(courseId === "all" ? undefined : { courseId }),
    placeholderData: keepPreviousData,
  });
  const close = useMutation({
    mutationFn: (id: string) => closeBatch(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: batchQueries.key.all });
    },
  });

  return (
    <BatchCatalog
      batches={batches?.items ?? []}
      courses={courses.items
        .filter((course) => course.archivedAt == null)
        .map((course) => ({ id: course.id, name: course.name }))}
      courseId={courseId}
      onCourseIdChange={setCourseId}
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
