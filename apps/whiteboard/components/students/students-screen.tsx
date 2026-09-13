"use client";

import { useEffect, useState } from "react";
import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useRouter } from "next/navigation";

import { StudentCatalog } from "@/components/students/student-catalog";
import { dashboardQueries } from "@/src/queries/dashboard";
import { dropStudent, studentQueries } from "@/src/queries/students";

export function StudentsScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [q, setQ] = useState<string | undefined>(undefined);
  useEffect(() => {
    const handle = window.setTimeout(() => {
      const next = search.trim();
      setQ(next.length === 0 ? undefined : next);
    }, 250);
    return () => {
      window.clearTimeout(handle);
    };
  }, [search]);
  const { data } = useQuery({
    ...studentQueries.list(q),
    placeholderData: keepPreviousData,
  });
  const drop = useMutation({
    mutationFn: (id: string) => dropStudent(id),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: studentQueries.key.all }),
        queryClient.invalidateQueries({ queryKey: dashboardQueries.key.all }),
      ]);
    },
  });

  return (
    <StudentCatalog
      students={data?.items ?? []}
      search={search}
      onSearchChange={setSearch}
      onAdd={() => {
        router.push("/students/new");
      }}
      onEdit={(student) => {
        router.push(`/students/${student.id}`);
      }}
      onDrop={(student) => {
        drop.mutate(student.id);
      }}
    />
  );
}
