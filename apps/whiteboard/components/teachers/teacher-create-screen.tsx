"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@repo/ui/components/button";

import { PageHeader } from "@/components/app-shell/page-header";
import {
  addTeacherDocument,
  createTeacher,
  teacherQueries,
} from "@/src/queries/teachers";
import { TeacherForm, type PendingTeacherDocument } from "./teacher-form";
import { encodeTeacherDocument } from "./teacher-files";

export function TeacherCreateScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [recovery, setRecovery] = useState<{
    teacherId: string;
    pending: PendingTeacherDocument[];
  } | null>(null);
  const [retrying, setRetrying] = useState(false);
  const create = useMutation({ mutationFn: createTeacher });
  async function uploadDocuments(
    teacherId: string,
    documents: PendingTeacherDocument[],
  ) {
    const failed: PendingTeacherDocument[] = [];
    for (const document of documents) {
      try {
        await addTeacherDocument(
          teacherId,
          await encodeTeacherDocument(document.kind, document.file),
        );
      } catch {
        failed.push(document);
      }
    }
    await queryClient.invalidateQueries({ queryKey: teacherQueries.key.all });
    if (failed.length > 0) {
      setRecovery({ teacherId, pending: failed });
      return;
    }
    router.push(`/teachers/${teacherId}`);
  }
  return (
    <main className="w-full p-6">
      <div className="max-w-4xl space-y-6">
        <PageHeader
          back={{ href: "/teachers", label: "Teachers" }}
          title="Add Teacher"
        />
        {recovery == null ? (
          <TeacherForm
            onSubmit={async (input, documents) => {
              const teacher = await create.mutateAsync(input);
              await uploadDocuments(teacher.id, documents);
            }}
            onCancel={() => {
              router.push("/teachers");
            }}
          />
        ) : (
          <section className="space-y-4 rounded-2xl border p-6">
            <h2 className="text-lg font-semibold">Teacher saved</h2>
            <p className="text-muted-foreground text-sm">
              {recovery.pending.length} document
              {recovery.pending.length === 1 ? "" : "s"} could not be uploaded.
              Retry here without creating another Teacher.
            </p>
            <ul className="list-disc pl-5 text-sm">
              {recovery.pending.map((document) => (
                <li key={document.id}>{document.file.name}</li>
              ))}
            </ul>
            <div className="flex gap-3">
              <Button
                type="button"
                disabled={retrying}
                onClick={() => {
                  setRetrying(true);
                  void uploadDocuments(
                    recovery.teacherId,
                    recovery.pending,
                  ).finally(() => {
                    setRetrying(false);
                  });
                }}
              >
                {retrying ? "Retrying…" : "Retry document uploads"}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  router.push(`/teachers/${recovery.teacherId}`);
                }}
              >
                Open Teacher profile
              </Button>
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
