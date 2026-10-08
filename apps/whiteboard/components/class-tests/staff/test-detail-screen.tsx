"use client";

import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { Eye, Pencil, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@repo/ui/components/alert-dialog";
import { Button } from "@repo/ui/components/button";
import { Card, CardContent, CardHeader } from "@repo/ui/components/card";

import { PageHeader } from "@/components/app-shell/page-header";
import { FormAlert } from "@/components/auth/form-alert";
import { PUBLISHED_EDIT_NOTE } from "@/components/class-tests/result-format";
import {
  classTestQueries,
  deleteClassTest,
  type ClassTestDetailView,
} from "@/src/queries/class-tests";

import { MarksForm } from "./marks-form";
import { TestFormDialog } from "./test-form-dialog";
import {
  dayDate,
  errorMessage,
  postedByLabel,
  timestampLabel,
} from "./test-staff-format";
import { TestBadges, TestSummary } from "./test-summary";

export function TestDetailScreen({
  testId,
  testsPath,
  studentBasePath,
}: {
  testId: string;
  /** The Batch's Tests page. */
  testsPath: string;
  /** A Student's name links to `${studentBasePath}/${studentId}`. */
  studentBasePath: string;
}) {
  const { data } = useSuspenseQuery(classTestQueries.detail(testId));
  return (
    <TestDetailContent
      view={data}
      testsPath={testsPath}
      studentBasePath={studentBasePath}
    />
  );
}

export function TestDetailContent({
  view,
  testsPath,
  studentBasePath,
}: {
  view: ClassTestDetailView;
  testsPath: string;
  studentBasePath: string;
}) {
  const { test, batch } = view;
  const queryClient = useQueryClient();
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const published = test.publishedAt != null;
  const remove = useMutation({
    mutationFn: () => deleteClassTest(test.id),
    onSuccess: async () => {
      setConfirmDelete(false);
      router.push(testsPath);
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: classTestQueries.key.batch(batch.id),
        }),
        queryClient.invalidateQueries({
          queryKey: [...classTestQueries.key.all, "student"],
        }),
      ]);
    },
  });

  return (
    <main className="w-full p-4 sm:p-6">
      <div className="mx-auto max-w-4xl space-y-6">
        <PageHeader
          back={{ label: "Tests", href: testsPath }}
          title={test.name}
          meta={`${batch.courseName} · ${batch.name}`}
          actions={
            <>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setEditing(true);
                }}
              >
                <Pencil aria-hidden="true" />
                Edit details
              </Button>
              {view.canDelete ? (
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => {
                    remove.reset();
                    setConfirmDelete(true);
                  }}
                >
                  <Trash2 aria-hidden="true" />
                  Delete test
                </Button>
              ) : null}
            </>
          }
        />
        <Card aria-label="Test details" role="region">
          <CardHeader className="gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <TestBadges test={test} />
            </div>
            <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
              <span>{dayDate(test.heldOn)}</span>
              <span>Out of {test.maxMarks}</span>
              {test.passMarks == null ? (
                <span className="text-muted-foreground">No pass mark</span>
              ) : (
                <span>Pass mark {test.passMarks}</span>
              )}
            </p>
          </CardHeader>
          <CardContent className="space-y-3">
            {test.topic == null ? null : (
              <p className="text-sm break-words whitespace-pre-line">
                {test.topic}
              </p>
            )}
            <p className="text-muted-foreground flex flex-wrap gap-x-3 gap-y-1 text-xs">
              <span>
                Created by {postedByLabel(test.createdBy)} ·{" "}
                {timestampLabel(test.createdAt, batch.timezone)}
              </span>
              {test.publishedAt == null ? null : (
                <span>
                  Published {timestampLabel(test.publishedAt, batch.timezone)}
                </span>
              )}
            </p>
            <div className="border-t pt-3">
              <TestSummary test={test} label="Saved results" />
            </div>
          </CardContent>
        </Card>
        {published ? (
          <div
            role="status"
            className="flex items-start gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800 dark:border-emerald-400/20 dark:bg-emerald-400/10 dark:text-emerald-200"
          >
            <Eye aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
            <p>{PUBLISHED_EDIT_NOTE}</p>
          </div>
        ) : null}
        <MarksForm
          key={test.id}
          view={view}
          studentBasePath={studentBasePath}
        />
      </div>
      <TestFormDialog
        open={editing}
        onOpenChange={setEditing}
        batchId={batch.id}
        firstDate={view.firstDate}
        today={view.today}
        testsPath={testsPath}
        test={test}
      />
      <AlertDialog
        open={confirmDelete}
        onOpenChange={(open) => {
          if (!open) setConfirmDelete(false);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{test.name}”?</AlertDialogTitle>
            <AlertDialogDescription>
              The Test and its saved marks are removed for everyone. Only a Test
              that hasn’t been published can be deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <FormAlert
            message={remove.isError ? errorMessage(remove.error) : undefined}
          />
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <Button
              type="button"
              variant="destructive"
              disabled={remove.isPending}
              onClick={() => {
                remove.mutate();
              }}
            >
              {remove.isPending ? "Deleting…" : "Delete test"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </main>
  );
}
