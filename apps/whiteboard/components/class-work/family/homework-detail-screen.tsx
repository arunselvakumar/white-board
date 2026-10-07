"use client";

import { useAuth } from "@repo/auth/react";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@repo/ui/components/alert-dialog";
import { Badge } from "@repo/ui/components/badge";
import { Button, buttonVariants } from "@repo/ui/components/button";
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/card";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
} from "@repo/ui/components/empty";
import { Label } from "@repo/ui/components/label";
import { Textarea } from "@repo/ui/components/textarea";
import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { z } from "zod";

import { FieldError } from "@/components/auth/field-error";
import { FormAlert } from "@/components/auth/form-alert";
import {
  AttachmentLinks,
  AttachmentPicker,
} from "@/components/class-work/attachments";
import type { FamilyHomeRole } from "@/components/home/family-home";
import {
  classWorkQueries,
  submitHomework,
  undoHomeworkSubmission,
  type FamilyBatchView,
  type FamilyClassWorkStudentView,
  type FamilyClassWorkView,
  type FamilyHomeworkView,
} from "@/src/queries/class-work";
import { QueryHttpError } from "@/src/queries/http";
import { daysBetween } from "@/src/training-institute/domain/class-schedule";

import {
  batchLabel,
  batchTimezone,
  batchToday,
  calendarDate,
  classDatePhrase,
  dueLabel,
  findBatch,
  homeworkPagePath,
  instantDate,
  instantLabel,
  postedByLabel,
  STATUS_LABELS,
} from "./family-class-work-format";
import { DUE_SOON_BADGE } from "./family-class-work-items";

const NOTE_MAX = 1000;

const ERROR_FALLBACKS: Record<string, string> = {
  HOMEWORK_SUBMISSION_CHECKED:
    "The Teacher has already checked this, so it can’t be changed now.",
  HOMEWORK_ACCESS_ENDED:
    "This Batch has ended, so this Homework can’t be submitted any more.",
  HOMEWORK_NOT_FOUND: "This Homework isn’t available any more.",
};

/** Errors that mean the page is out of date: reload it to show why. */
const STALE_CODES = new Set(Object.keys(ERROR_FALLBACKS));

function submissionErrorMessage(error: unknown): string {
  if (error instanceof QueryHttpError) {
    if (error.message.length > 0) return error.message;
    return (
      ERROR_FALLBACKS[error.code] ??
      (error.code.startsWith("ATTACHMENT_")
        ? "One of the files couldn’t be attached. Remove it and try again."
        : "Something went wrong. Please try again.")
    );
  }
  return "Something went wrong. Please try again.";
}

const schema = z.object({
  note: z
    .string()
    .max(NOTE_MAX, `Keep the note to ${NOTE_MAX} characters or fewer`),
  attachments: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      mimeType: z.enum(["application/pdf", "image/jpeg", "image/png"]),
      sizeBytes: z.number(),
    }),
  ),
});

type Values = z.infer<typeof schema>;

function submittedByLabel(
  by: "student" | "parent",
  role: FamilyHomeRole,
  studentName: string,
): string {
  if (by === "parent") return "Marked done by a Parent";
  return role === "student"
    ? "Marked done by you"
    : `Marked done by ${studentName}`;
}

function replaceHomework(
  data: FamilyClassWorkView | undefined,
  studentId: string,
  updated: FamilyHomeworkView,
): FamilyClassWorkView | undefined {
  if (data == null) return data;
  return {
    students: data.students.map((student) =>
      student.id !== studentId
        ? student
        : {
            ...student,
            homework: student.homework.map((item) =>
              item.id === updated.id ? updated : item,
            ),
          },
    ),
  };
}

function SubmissionForm({
  homework,
  studentId,
  onSaved,
  onError,
}: {
  homework: FamilyHomeworkView;
  studentId: string;
  onSaved: (updated: FamilyHomeworkView, message: string) => void;
  onError: (error: unknown) => void;
}) {
  const submission = homework.submission;
  const [uploading, setUploading] = useState(false);
  const [confirmUndo, setConfirmUndo] = useState(false);
  const [undoing, setUndoing] = useState(false);
  const {
    register,
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      note: submission?.note ?? "",
      attachments: submission?.attachments ?? [],
    },
  });
  const busy = isSubmitting || undoing;

  async function undo() {
    setConfirmUndo(false);
    setUndoing(true);
    try {
      const updated = await undoHomeworkSubmission(homework.id, studentId);
      onSaved(updated, "Undone. It’s no longer marked done.");
    } catch (error) {
      onError(error);
    } finally {
      setUndoing(false);
    }
  }

  return (
    <form
      noValidate
      className="space-y-4"
      onSubmit={handleSubmit(async (values) => {
        try {
          const note = values.note.trim();
          const updated = await submitHomework(homework.id, {
            studentId,
            note: note.length === 0 ? null : note,
            attachmentIds: values.attachments.map((file) => file.id),
          });
          onSaved(
            updated,
            submission == null ? "Marked as done." : "Changes saved.",
          );
        } catch (error) {
          onError(error);
        }
      })}
    >
      <div className="space-y-1.5">
        <Label htmlFor="submission-note">
          Note <span className="text-muted-foreground">(optional)</span>
        </Label>
        <Textarea
          id="submission-note"
          rows={3}
          placeholder="Anything the Teacher should know"
          aria-invalid={errors.note != null}
          disabled={busy}
          {...register("note")}
        />
        <FieldError message={errors.note?.message} />
      </div>
      <div className="space-y-1.5">
        <p className="text-sm font-medium">Files</p>
        <Controller
          name="attachments"
          control={control}
          render={({ field }) => (
            <AttachmentPicker
              value={field.value}
              onChange={field.onChange}
              disabled={busy}
              onBusyChange={setUploading}
            />
          )}
        />
      </div>
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        {submission != null && (
          <Button
            type="button"
            variant="outline"
            disabled={busy || uploading}
            onClick={() => {
              setConfirmUndo(true);
            }}
          >
            Undo
          </Button>
        )}
        <Button type="submit" disabled={busy || uploading}>
          {submission == null ? "Mark as done" : "Save changes"}
        </Button>
      </div>
      <AlertDialog open={confirmUndo} onOpenChange={setConfirmUndo}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Undo marking this done?</AlertDialogTitle>
            <AlertDialogDescription>
              {homework.title} goes back to not submitted. You can mark it done
              again before the Teacher checks it.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <Button
              type="button"
              variant="destructive"
              onClick={() => void undo()}
            >
              Undo
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </form>
  );
}

function YourWorkCard({
  homework,
  student,
  batch,
  role,
}: {
  homework: FamilyHomeworkView;
  student: FamilyClassWorkStudentView;
  batch: FamilyBatchView | undefined;
  role: FamilyHomeRole;
}) {
  const queryClient = useQueryClient();
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const parent = role === "parent";
  const submission = homework.submission;
  const timezone = batchTimezone(batch);
  const checked = homework.status === "checked";
  const batchName = batch?.name ?? "This Batch";

  function saved(updated: FamilyHomeworkView, message: string) {
    setError(null);
    setNotice(message);
    queryClient.setQueriesData<FamilyClassWorkView>(
      { queryKey: classWorkQueries.key.family },
      (data) => replaceHomework(data, student.id, updated),
    );
    void queryClient.invalidateQueries({ queryKey: classWorkQueries.key.all });
  }

  function failed(cause: unknown) {
    setNotice(null);
    setError(submissionErrorMessage(cause));
    if (cause instanceof QueryHttpError && STALE_CODES.has(cause.code))
      void queryClient.invalidateQueries({
        queryKey: classWorkQueries.key.all,
      });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{parent ? `${student.name}’s work` : "Your work"}</CardTitle>
        <CardAction>
          <Badge
            variant={
              homework.status === "overdue"
                ? "destructive"
                : homework.status === "checked" ||
                    homework.status === "submitted"
                  ? "secondary"
                  : "outline"
            }
          >
            {STATUS_LABELS[homework.status]}
          </Badge>
        </CardAction>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        {submission != null && (
          <div className="space-y-1">
            <p className="flex flex-wrap items-center gap-2">
              <span>
                Submitted {instantLabel(submission.submittedAt, timezone)}
              </span>
              {submission.late && <Badge variant="outline">Late</Badge>}
            </p>
            <p className="text-muted-foreground">
              {submittedByLabel(submission.submittedBy, role, student.name)}
            </p>
          </div>
        )}

        {checked && submission != null && (
          <div className="space-y-3">
            <div className="bg-muted/60 space-y-1 rounded-lg border p-3">
              <p className="text-muted-foreground text-xs">
                Teacher’s remark
                {submission.checkedAt != null &&
                  ` · Checked ${instantDate(submission.checkedAt, timezone)}`}
              </p>
              <p className="text-base break-words whitespace-pre-line">
                {submission.remark != null && submission.remark.length > 0
                  ? submission.remark
                  : "Checked. No remark was added."}
              </p>
            </div>
            <p className="text-muted-foreground">
              It’s been checked, so it can’t be changed now.
            </p>
          </div>
        )}

        {!homework.canSubmit && submission != null && (
          <div className="space-y-2">
            {submission.note != null && submission.note.length > 0 && (
              <p className="break-words whitespace-pre-line">
                {submission.note}
              </p>
            )}
            <AttachmentLinks attachments={submission.attachments} />
          </div>
        )}

        {!homework.canSubmit && !checked && (
          <p className="text-muted-foreground">
            {parent
              ? `${batchName} has ended for ${student.name}, so this can’t be submitted any more.`
              : `${batchName} has ended for you, so this can’t be submitted any more.`}
          </p>
        )}

        {homework.canSubmit &&
          homework.status === "reference" &&
          submission == null && (
            <p className="text-muted-foreground">
              {parent
                ? `This was due before ${student.name} joined, so it isn’t counted. It can still be submitted.`
                : "This was due before you joined, so it isn’t counted. You can still submit it."}
            </p>
          )}

        {notice != null && (
          <p role="status" className="text-sm font-medium">
            {notice}
          </p>
        )}
        <FormAlert message={error ?? undefined} />

        {homework.canSubmit && (
          <SubmissionForm
            key={submission?.updatedAt ?? "not-submitted"}
            homework={homework}
            studentId={student.id}
            onSaved={saved}
            onError={failed}
          />
        )}
      </CardContent>
    </Card>
  );
}

function NotAvailable({ role }: { role: FamilyHomeRole }) {
  return (
    <main className="w-full p-6">
      <div className="max-w-3xl">
        <Empty className="border">
          <EmptyHeader>
            <EmptyDescription>This Homework isn’t available.</EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Link
              href={homeworkPagePath(role)}
              className={buttonVariants({ variant: "outline" })}
            >
              Back to Homework
            </Link>
          </EmptyContent>
        </Empty>
      </div>
    </main>
  );
}

export function HomeworkDetail({
  classWork,
  role,
  homeworkId,
  studentId,
  now = new Date(),
}: {
  classWork: FamilyClassWorkView;
  role: FamilyHomeRole;
  homeworkId: string;
  /** From `?student=`; without it, the first linked Student with this Homework. */
  studentId: string | null;
  now?: Date;
}) {
  const student = classWork.students.find(
    (candidate) =>
      (studentId == null || candidate.id === studentId) &&
      candidate.homework.some((item) => item.id === homeworkId),
  );
  const homework = student?.homework.find((item) => item.id === homeworkId);
  if (student == null || homework == null) return <NotAvailable role={role} />;

  const batch = findBatch(student, homework.batchId);
  const today = batchToday(batch, now);
  const label = batchLabel(batch);
  const classAgo = daysBetween(homework.classDate, today);
  const dueToday = homework.status === "due" && homework.dueOn === today;

  return (
    <main className="w-full p-6">
      <div className="max-w-3xl space-y-6">
        <Link
          href={homeworkPagePath(role)}
          className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm"
        >
          <ArrowLeft aria-hidden="true" className="size-4" /> All Homework
        </Link>
        <header className="space-y-2">
          {role === "parent" && (
            <p className="text-muted-foreground text-sm">For {student.name}</p>
          )}
          <h1 className="text-2xl tracking-tight break-words">
            {homework.title}
          </h1>
          {label != null && (
            <p className="text-muted-foreground text-sm">{label}</p>
          )}
          <div className="space-y-1 text-sm">
            <p>
              {classDatePhrase(homework.classDate, today)}
              {classAgo >= 0 && classAgo < 7 && (
                <span className="text-muted-foreground">
                  {" "}
                  · {calendarDate(homework.classDate)}
                </span>
              )}
            </p>
            <p className="flex flex-wrap items-center gap-2">
              {dueToday ? (
                <Badge variant="outline" className={DUE_SOON_BADGE}>
                  Due today
                </Badge>
              ) : (
                <span
                  className={
                    homework.status === "overdue"
                      ? "text-destructive font-medium"
                      : undefined
                  }
                >
                  {dueLabel(homework, today)}
                </span>
              )}
              {homework.status === "overdue" && (
                <Badge variant="destructive">Overdue</Badge>
              )}
            </p>
          </div>
        </header>

        <Card>
          <CardHeader>
            <CardTitle>Instructions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <p className="break-words whitespace-pre-wrap">
              {homework.instructions}
            </p>
            <AttachmentLinks attachments={homework.attachments} />
            <p className="text-muted-foreground text-xs">
              Posted by {postedByLabel(homework.postedBy)} on{" "}
              {instantDate(homework.postedAt, batchTimezone(batch))}
            </p>
          </CardContent>
        </Card>

        <YourWorkCard
          homework={homework}
          student={student}
          batch={batch}
          role={role}
        />
      </div>
    </main>
  );
}

export function HomeworkDetailScreen({
  role,
  homeworkId,
  studentId,
  now,
}: {
  role: FamilyHomeRole;
  homeworkId: string;
  studentId: string | null;
  now?: Date;
}) {
  const { workspaceId, userId } = useAuth();
  const { data } = useSuspenseQuery(
    classWorkQueries.family(`${workspaceId}:${userId}:${role}`),
  );
  return (
    <HomeworkDetail
      classWork={data}
      role={role}
      homeworkId={homeworkId}
      studentId={studentId}
      now={now}
    />
  );
}
