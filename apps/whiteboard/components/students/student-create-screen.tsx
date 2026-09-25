"use client";

import { useAuth } from "@clerk/nextjs";
import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { Button } from "@repo/ui/components/button";

import { PageHeader } from "@/components/app-shell/page-header";
import { StudentForm } from "@/components/students/student-form";
import { invalidateRegisterQueries } from "@/src/queries/invalidate-register";
import {
  admitStudent,
  completeAdmissionEnrollment,
  studentAdmissionQueries,
} from "@/src/queries/student-admission";
import { QueryHttpError } from "@/src/queries/http";
import type {
  StudentResponse,
  StudentWriteInput,
} from "@/src/queries/students";

type PendingAdmission = {
  requestId: string;
  input: StudentWriteInput;
  batchId: string | null;
  student?: StudentResponse;
  error?: string;
  uncertain?: boolean;
};

function storageKey(
  orgId: string | null | undefined,
  userId: string | null | undefined,
) {
  return `student-admission:${orgId}:${userId}`;
}

export function StudentEnrollmentRecovery({
  studentName,
  batchLabel,
  error,
  retrying,
  uncertain,
  onRetry,
  onChooseBatch,
  onViewStudent,
}: {
  studentName: string;
  batchLabel: string;
  error: string;
  retrying: boolean;
  uncertain: boolean;
  onRetry: () => void;
  onChooseBatch: () => void;
  onViewStudent: () => void;
}) {
  return (
    <main className="w-full p-6">
      <div className="max-w-4xl space-y-6">
        <PageHeader
          back={{ href: "/students", label: "Students" }}
          title="Student saved"
        />
        <section className="bg-card space-y-4 rounded-2xl border p-6 shadow-sm">
          <p className="font-medium">
            {studentName} was added.{" "}
            {uncertain
              ? `We could not confirm the Enrollment in ${batchLabel}.`
              : `The Enrollment in ${batchLabel} was not completed.`}
          </p>
          <p role="alert" className="text-destructive text-sm">
            {error}
          </p>
          <p className="text-muted-foreground text-sm">
            The Student is already saved.{" "}
            {uncertain
              ? "Retry to check the Enrollment status."
              : "Retry the Enrollment or choose another Batch."}
          </p>
          <div className="flex flex-wrap gap-3">
            <Button type="button" disabled={retrying} onClick={onRetry}>
              {retrying ? "Retrying…" : "Retry Enrollment"}
            </Button>
            {!uncertain && (
              <Button type="button" variant="outline" onClick={onChooseBatch}>
                Choose another Batch
              </Button>
            )}
            <Button type="button" variant="ghost" onClick={onViewStudent}>
              View Student
            </Button>
          </div>
        </section>
      </div>
    </main>
  );
}

export function StudentCreateScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { orgId, userId } = useAuth();
  const { data: enrollmentBatches } = useSuspenseQuery(
    studentAdmissionQueries.batchOptions(orgId),
  );
  const [pending, setPending] = useState<PendingAdmission | null>(null);
  const [restored, setRestored] = useState(false);
  const key = storageKey(orgId, userId);
  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      try {
        const saved = sessionStorage.getItem(key);
        if (saved != null) setPending(JSON.parse(saved) as PendingAdmission);
      } catch {
        sessionStorage.removeItem(key);
      }
      setRestored(true);
    });
    return () => {
      active = false;
    };
  }, [key]);
  const savePending = (value: PendingAdmission | null) => {
    if (value == null) sessionStorage.removeItem(key);
    else sessionStorage.setItem(key, JSON.stringify(value));
    setPending(value);
  };
  const create = useMutation({
    mutationFn: (draft: PendingAdmission) =>
      admitStudent(draft.input, draft.batchId, draft.requestId, (student) => {
        savePending({ ...draft, student });
      }),
  });
  const retry = useMutation({
    mutationFn: ({
      student,
      batchId,
    }: {
      student: StudentResponse;
      batchId: string;
    }) => completeAdmissionEnrollment(student, batchId),
  });

  const submitAdmission = async (draft: PendingAdmission, fromForm = false) => {
    if (pending == null) {
      sessionStorage.setItem(key, JSON.stringify(draft));
    } else {
      savePending(draft);
    }
    try {
      const result = await create.mutateAsync(draft);
      if (result.enrollment === "failed") {
        savePending({
          ...draft,
          student: result.student,
          uncertain: result.uncertain,
          error:
            result.error instanceof Error
              ? result.error.message
              : "Could not complete the Enrollment.",
        });
        void invalidateRegisterQueries(queryClient).catch(() => undefined);
        return;
      }
      savePending(null);
      await invalidateRegisterQueries(queryClient).catch(() => undefined);
      router.push(
        result.enrollment === "enrolled"
          ? `/students/${result.student.id}`
          : "/students",
      );
    } catch (error) {
      if (
        error instanceof QueryHttpError &&
        error.status >= 400 &&
        error.status < 500
      ) {
        if (fromForm) {
          savePending(null);
          throw error;
        }
        savePending({ ...draft, error: error.message, uncertain: false });
        return;
      }
      savePending({
        ...draft,
        error:
          "We could not confirm whether the Student was saved. Resume to check without creating a duplicate.",
        uncertain: true,
      });
    }
  };

  if (!restored) return null;

  if (pending != null && create.isPending) {
    return (
      <main className="w-full p-6">
        <div className="max-w-4xl space-y-6">
          <PageHeader
            back={{ href: "/students", label: "Students" }}
            title="Saving Student"
          />
          <p role="status" className="text-muted-foreground text-sm">
            Saving the Student and checking the Enrollment…
          </p>
        </div>
      </main>
    );
  }

  if (pending?.student != null && pending.batchId != null) {
    const student = pending.student;
    const batchId = pending.batchId;
    return (
      <StudentEnrollmentRecovery
        studentName={student.name}
        batchLabel={
          enrollmentBatches.find((batch) => batch.id === batchId)?.label ??
          "the selected Batch"
        }
        error={pending.error ?? "The Enrollment needs to be checked."}
        uncertain={pending.uncertain ?? true}
        retrying={retry.isPending}
        onRetry={() => {
          void (async () => {
            try {
              const result = await retry.mutateAsync({
                student,
                batchId,
              });
              if (result.enrollment === "enrolled") {
                savePending(null);
                await invalidateRegisterQueries(queryClient).catch(
                  () => undefined,
                );
                router.push(`/students/${student.id}`);
              } else if (result.enrollment === "failed") {
                savePending({
                  ...pending,
                  uncertain: result.uncertain,
                  error:
                    result.error instanceof Error
                      ? result.error.message
                      : "Could not complete the Enrollment.",
                });
              }
            } catch (error) {
              savePending({
                ...pending,
                uncertain: true,
                error:
                  error instanceof Error
                    ? error.message
                    : "Could not complete the Enrollment.",
              });
            }
          })();
        }}
        onChooseBatch={() => {
          savePending(null);
          router.push(`/students/${student.id}/enroll`);
        }}
        onViewStudent={() => {
          savePending(null);
          router.push(`/students/${student.id}`);
        }}
      />
    );
  }

  if (pending != null) {
    return (
      <main className="w-full p-6">
        <div className="max-w-4xl space-y-6">
          <PageHeader
            back={{ href: "/students", label: "Students" }}
            title="Resume Student setup"
          />
          <section className="bg-card space-y-4 rounded-2xl border p-6 shadow-sm">
            <p>{pending.error ?? "The Student save needs to be checked."}</p>
            <Button
              type="button"
              disabled={create.isPending}
              onClick={() => void submitAdmission(pending)}
            >
              {create.isPending ? "Checking…" : "Resume save"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                router.push(`/students/${pending.requestId}`);
              }}
            >
              Check Student
            </Button>
          </section>
        </div>
      </main>
    );
  }

  return (
    <StudentForm
      back={{ href: "/students", label: "Students" }}
      submitLabel="Save Student"
      enrollmentBatches={enrollmentBatches}
      onCancel={() => {
        router.push("/students");
      }}
      onSubmit={(input, enrollment) =>
        submitAdmission(
          {
            requestId: crypto.randomUUID(),
            input,
            batchId: enrollment.batchId,
          },
          true,
        )
      }
    />
  );
}
