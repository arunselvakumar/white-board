"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";

import { PageHeader } from "@/components/app-shell/page-header";
import { createTeacher, teacherQueries } from "@/src/queries/teachers";
import { TeacherForm } from "./teacher-form";

export function TeacherCreateScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const create = useMutation({ mutationFn: createTeacher, onSuccess: async (teacher) => {
    await queryClient.invalidateQueries({ queryKey: teacherQueries.key.all });
    router.push(`/teachers/${teacher.id}`);
  } });
  return <main className="w-full p-6"><div className="max-w-4xl space-y-6"><PageHeader back={{ href: "/teachers", label: "Teachers" }} title="Add Teacher" />
    <TeacherForm onSubmit={async (input) => { await create.mutateAsync(input); }} onCancel={() => { router.push("/teachers"); }} />
  </div></main>;
}
