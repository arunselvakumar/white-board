"use client";

import { useSuspenseQuery } from "@tanstack/react-query";
import { useAuth } from "@clerk/nextjs";
import Link from "next/link";
import { useState } from "react";
import { Button } from "@repo/ui/components/button";

import { PageHeader } from "@/components/app-shell/page-header";
import { teacherQueries } from "@/src/queries/teachers";
import { TeachersEmptyState } from "./teachers-empty-state";
import { TeacherAvatar } from "./teacher-avatar";

export function TeachersScreen() {
  const { orgId } = useAuth();
  const [page, setPage] = useState(1);
  const [cursor, setCursor] = useState<{ after?: string; before?: string }>({});
  const { data } = useSuspenseQuery(
    teacherQueries.list(orgId, { limit: 20, ...cursor }),
  );
  return (
    <main className="w-full p-6">
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="flex items-center justify-between">
          <PageHeader title="Teachers" />
          <Button render={<Link href="/teachers/new" />}>Add Teacher</Button>
        </div>
        {data.items.length === 0 ? (
          <TeachersEmptyState />
        ) : (
          <div className="divide-y rounded-xl border">
            {data.items.map((teacher) => (
              <Link
                key={teacher.id}
                href={`/teachers/${teacher.id}`}
                className="hover:bg-muted/40 flex items-center justify-between gap-4 p-4"
              >
                <span className="flex items-center gap-3">
                  <TeacherAvatar
                    name={teacher.name}
                    photoUrl={teacher.photoUrl}
                    className="size-11"
                  />
                  <span>
                    <span className="block font-medium">
                      {teacher.preferredName ?? teacher.name}
                    </span>
                    <span className="text-muted-foreground text-sm">
                      {teacher.email}
                    </span>
                  </span>
                </span>
                <span className="text-muted-foreground text-sm">
                  {teacher.deactivatedAt
                    ? "Inactive"
                    : teacher.kind === "visiting_tutor"
                      ? "Visiting Tutor"
                      : "Centre Teacher"}{" "}
                  · {teacher.invitationStatus}
                </span>
              </Link>
            ))}
          </div>
        )}
        {data.total > 20 && (
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              disabled={!data.prevCursor}
              onClick={() => {
                if (data.prevCursor) {
                  setCursor({ before: data.prevCursor });
                  setPage((current) => current - 1);
                }
              }}
            >
              Previous
            </Button>
            <span className="text-sm">
              Page {page} · {data.total} Teachers
            </span>
            <Button
              variant="outline"
              disabled={!data.nextCursor}
              onClick={() => {
                if (data.nextCursor) {
                  setCursor({ after: data.nextCursor });
                  setPage((current) => current + 1);
                }
              }}
            >
              Next
            </Button>
          </div>
        )}
      </div>
    </main>
  );
}
