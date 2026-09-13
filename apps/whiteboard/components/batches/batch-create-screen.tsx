"use client";

import { useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";

import { BatchForm } from "@/components/batches/batch-form";
import { batchQueries, createBatch } from "@/src/queries/batches";
import { courseQueries } from "@/src/queries/courses";

export function BatchCreateScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data: courses } = useSuspenseQuery(courseQueries.list());
  const create = useMutation({
    mutationFn: createBatch,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: batchQueries.key.all });
      router.push("/batches");
    },
  });
  const activeCourses = courses.items.filter(
    (course) => course.archivedAt == null,
  );

  return (
    <div className="mx-auto flex w-full max-w-lg flex-col gap-6 p-6">
      <h1 className="text-2xl tracking-tight">Add Batch</h1>
      <BatchForm
        courses={activeCourses.map((course) => ({
          id: course.id,
          name: course.name,
        }))}
        submitLabel="Save Batch"
        onCancel={() => {
          router.push("/batches");
        }}
        onSubmit={async (input) => {
          await create.mutateAsync(input);
        }}
      />
    </div>
  );
}
