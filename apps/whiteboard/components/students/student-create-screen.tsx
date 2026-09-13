"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";

import { StudentForm } from "@/components/students/student-form";
import { dashboardQueries } from "@/src/queries/dashboard";
import { createStudent, studentQueries } from "@/src/queries/students";

export function StudentCreateScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const create = useMutation({
    mutationFn: createStudent,
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: studentQueries.key.all }),
        queryClient.invalidateQueries({ queryKey: dashboardQueries.key.all }),
      ]);
      router.push("/students");
    },
  });

  return (
    <div className="mx-auto flex w-full max-w-lg flex-col gap-6 p-6">
      <h1 className="text-2xl tracking-tight">Add Student</h1>
      <StudentForm
        submitLabel="Save Student"
        onCancel={() => {
          router.push("/students");
        }}
        onSubmit={async (input) => {
          await create.mutateAsync(input);
        }}
      />
    </div>
  );
}
