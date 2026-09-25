"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";

import { StudentForm } from "@/components/students/student-form";
import { dashboardQueries } from "@/src/queries/dashboard";
import {
  createStudent,
  studentQueries,
  type StudentListResponse,
} from "@/src/queries/students";

export function StudentCreateScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const create = useMutation({
    mutationFn: createStudent,
    onSuccess: async (student) => {
      const listKey = studentQueries.key.list();
      const cachedList = queryClient.getQueryData<StudentListResponse>(listKey);
      if (cachedList != null) {
        queryClient.setQueryData<StudentListResponse>(listKey, {
          ...cachedList,
          items: [student, ...cachedList.items].slice(0, 100),
          total: cachedList.total + 1,
        });
      }
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: studentQueries.key.all }),
        queryClient.invalidateQueries({ queryKey: dashboardQueries.key.all }),
      ]);
      if (cachedList == null) {
        await queryClient.query(studentQueries.list());
      }
      router.push("/students");
    },
  });

  return (
    <StudentForm
      back={{ href: "/students", label: "Students" }}
      submitLabel="Save Student"
      onCancel={() => {
        router.push("/students");
      }}
      onSubmit={async (input) => {
        await create.mutateAsync(input);
      }}
    />
  );
}
