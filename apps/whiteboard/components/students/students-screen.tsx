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
import {
  dropStudent,
  studentQueries,
  type StudentListPage,
} from "@/src/queries/students";

const PAGE_SIZE = 12;

export function StudentsScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [q, setQ] = useState<string | undefined>(undefined);
  const [page, setPage] = useState(1);
  const [cursor, setCursor] =
    useState<Pick<StudentListPage, "after" | "before">>();
  useEffect(() => {
    const handle = window.setTimeout(() => {
      const next = search.trim();
      setQ(next.length === 0 ? undefined : next);
    }, 250);
    return () => {
      window.clearTimeout(handle);
    };
  }, [search]);
  const { data, isPending, isFetching, isPlaceholderData, isError, refetch } =
    useQuery({
      ...studentQueries.list(q, { limit: PAGE_SIZE, ...cursor }),
      placeholderData: keepPreviousData,
    });
  const waitingForSearch = search.trim() !== (q ?? "");
  const loading =
    isPending ||
    isPlaceholderData ||
    waitingForSearch ||
    (isFetching && (data?.items.length ?? 0) === 0);
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
      loading={loading}
      updating={isFetching && !loading}
      loadError={isError && data == null}
      onRetry={() => {
        void refetch();
      }}
      search={search}
      onSearchChange={(value) => {
        setSearch(value);
        setCursor(undefined);
        setPage(1);
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
        router.push("/students/new");
      }}
      onView={(student) => {
        router.push(`/students/${student.id}`);
      }}
      onEdit={(student) => {
        router.push(`/students/${student.id}/edit`);
      }}
      onDrop={(student) => {
        drop.mutate(student.id);
      }}
    />
  );
}
