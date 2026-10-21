"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useSuspenseQuery } from "@tanstack/react-query";
import {
  CircleCheck,
  Pencil,
  RotateCcw,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Suspense, useState, type ReactNode } from "react";
import { Controller, useForm } from "react-hook-form";
import { z } from "zod";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@repo/ui/components/alert-dialog";
import { Button, buttonVariants } from "@repo/ui/components/button";
import { Label } from "@repo/ui/components/label";
import { Textarea } from "@repo/ui/components/textarea";
import { cn } from "@repo/ui/lib/utils";

import { FieldError } from "@/components/auth/field-error";
import { FormAlert } from "@/components/auth/form-alert";
import { LocationLabel } from "@/components/locations/location-picker";
import { formatDate } from "@/components/payments/payment-format";
import { SiteRecordHeader } from "@/components/site-work/site-record-header";
import { TrackingDocumentFiles } from "@/components/tracking/documents/tracking-document-files";
import { TrackingEntryFilesField } from "@/components/tracking/documents/tracking-entry-files-field";
import { TrackingFileStrip } from "@/components/tracking/documents/tracking-file-strip";
import { trackingRecordPath } from "@/lib/tracking-paths";
import { QueryHttpError } from "@/src/queries/http";
import {
  canInTracking,
  trackingAccessQuery,
} from "@/src/queries/tracking-access";
import type { TrackingDocumentFile } from "@/src/queries/tracking-documents";
import {
  issueProgressQuery,
  issueQuery,
  issuesPath,
  useDeleteIssue,
  useDeleteIssueProgress,
  useIssueTransition,
  usePostIssueProgress,
  type IssueDetail as Issue,
  type IssueProgress,
} from "@/src/queries/tracking-issues";
import { ISSUE_LIMITS } from "@/src/tracking/domain/issue";

import { IssueReopenDialog } from "./issue-reopen-dialog";
import { formatDateTime, IssueStatusBadge, PriorityChip } from "./issue-parts";
import { FactValueSkeleton } from "@/components/procurement/procurement-skeletons";
import { UpdatesSkeleton } from "@/components/tracking/tracking-skeletons";

function Fact({
  label,
  className,
  children,
}: {
  label: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn("min-w-0", className)}>
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd className="text-sm break-words whitespace-pre-line">{children}</dd>
    </div>
  );
}

function message(caught: unknown): string {
  return caught instanceof QueryHttpError
    ? caught.message
    : "Something went wrong. Please try again.";
}

const FIELD_WORDS: Record<string, string> = {
  issueDate: "Issue Date",
  details: "details",
  priority: "priority",
  categoryId: "category",
  departmentId: "Department",
  contractorId: "Contractor",
  assigneeMemberId: "Assign To",
  dueDate: "Due Date",
  siteLocation: "location",
};

/** One line of the lifecycle history. */
export function historyLine(item: Issue["history"][number]): string {
  const payload = (item.payload ?? {}) as Record<string, unknown>;
  switch (item.kind) {
    case "created":
      return payload["sourceInspectionId"] == null
        ? "Raised"
        : "Raised from a rejected Inspection Request";
    case "edited": {
      const fields = Array.isArray(payload["fields"])
        ? (payload["fields"] as string[]).map(
            (field) => FIELD_WORDS[field] ?? field,
          )
        : [];
      return fields.length === 0 ? "Edited" : `Edited ${fields.join(", ")}`;
    }
    case "assigned": {
      const to = payload["to"];
      if (to == null) return "Unassigned";
      const name = payload["toName"];
      return `Assigned to ${typeof name === "string" ? name : "a former member"}`;
    }
    case "solved":
      return "Marked as solved";
    case "closed":
      return "Verified and closed";
    case "reopened":
      return item.reason == null ? "Reopened" : `Reopened: ${item.reason}`;
    default:
      return item.kind;
  }
}

const composerSchema = z.object({
  body: z
    .string()
    .max(
      ISSUE_LIMITS.updateBody,
      `Use at most ${String(ISSUE_LIMITS.updateBody)} characters.`,
    ),
  photos: z.custom<TrackingDocumentFile[]>(),
});
type ComposerValues = z.infer<typeof composerSchema>;

/** Add Update: a comment, images, or both. */
function ProgressComposer({ issue }: { issue: Issue }) {
  const post = usePostIssueProgress(issue.id);
  const [error, setError] = useState<string | undefined>();
  const form = useForm<ComposerValues>({
    resolver: zodResolver(composerSchema),
    defaultValues: { body: "", photos: [] },
  });
  const errors = form.formState.errors;
  const submit = form.handleSubmit(async (values) => {
    setError(undefined);
    const body = values.body.trim();
    if (body === "" && values.photos.length === 0) {
      form.setError("body", { message: "Write a comment or add images." });
      return;
    }
    try {
      await post.mutateAsync({
        body: body === "" ? null : body,
        fileIds: values.photos.map((file) => file.id),
      });
      form.reset({ body: "", photos: [] });
    } catch (caught) {
      setError(message(caught));
    }
  });
  return (
    <form
      noValidate
      aria-label="Add Update"
      className="min-w-0 space-y-3 rounded-lg border p-4"
      onSubmit={(event) => {
        void submit(event);
      }}
    >
      <div className="space-y-1.5">
        <Label htmlFor="issue-update-body">Add Update</Label>
        <Textarea
          id="issue-update-body"
          rows={2}
          placeholder="What was done, or what is still needed"
          aria-invalid={errors.body != null}
          {...form.register("body")}
        />
        <FieldError message={errors.body?.message} />
      </div>
      <Controller
        control={form.control}
        name="photos"
        render={({ field }) => (
          <TrackingEntryFilesField
            documentType="issue"
            documentId={issue.id}
            photosOnly
            label="Images"
            value={field.value}
            onChange={field.onChange}
            disabled={form.formState.isSubmitting}
          />
        )}
      />
      <FormAlert message={error} />
      <div className="flex justify-end">
        <Button type="submit" size="sm" disabled={form.formState.isSubmitting}>
          {form.formState.isSubmitting ? "Posting…" : "Post update"}
        </Button>
      </div>
    </form>
  );
}

function ProgressItem({
  issueId,
  update,
}: {
  issueId: string;
  update: IssueProgress;
}) {
  const remove = useDeleteIssueProgress(issueId);
  const [error, setError] = useState<string | undefined>();
  return (
    <li className="min-w-0 space-y-2 rounded-lg border p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="text-sm">
          <span className="font-medium">
            {update.by.name ?? "A former member"}
          </span>{" "}
          <span className="text-muted-foreground text-xs">
            {formatDateTime(update.createdAt)}
          </span>
        </p>
        {update.canDelete && (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="text-destructive h-7"
            disabled={remove.isPending}
            onClick={() => {
              setError(undefined);
              remove.mutate(update.id, {
                onError: (caught) => {
                  setError(message(caught));
                },
              });
            }}
          >
            <Trash2 aria-hidden="true" />
            Delete
          </Button>
        )}
      </div>
      {update.body != null && (
        <p className="text-sm break-words whitespace-pre-line">{update.body}</p>
      )}
      <TrackingFileStrip
        files={update.files}
        label={`Images of the update by ${update.by.name ?? "a former member"}`}
      />
      <FormAlert message={error} />
    </li>
  );
}

/** The Progress thread: updates oldest first, and the composer. */
function ProgressThread({ issue }: { issue: Issue }) {
  const { data } = useSuspenseQuery(issueProgressQuery(issue.id));
  return (
    <section aria-labelledby="issue-progress" className="min-w-0 space-y-3">
      <h3 id="issue-progress" className="text-sm font-semibold">
        Progress
      </h3>
      {data.items.length === 0 ? (
        <p className="text-muted-foreground text-sm">No updates yet.</p>
      ) : (
        <ul aria-label="Updates" className="space-y-2">
          {data.items.map((update) => (
            <ProgressItem key={update.id} issueId={issue.id} update={update} />
          ))}
        </ul>
      )}
      {issue.actions.postUpdate && <ProgressComposer issue={issue} />}
    </section>
  );
}

function History({ issue }: { issue: Issue }) {
  return (
    <section aria-labelledby="issue-history" className="min-w-0 space-y-3">
      <h3 id="issue-history" className="text-sm font-semibold">
        History
      </h3>
      <ol aria-label="History" className="space-y-2 border-l pl-4">
        {issue.history.map((item) => (
          <li key={item.id} className="text-sm">
            <p className="break-words">{historyLine(item)}</p>
            <p className="text-muted-foreground text-xs">
              {item.by.name ?? "A former member"} · {formatDateTime(item.at)}
            </p>
          </li>
        ))}
      </ol>
    </section>
  );
}

/**
 * One Issue & Snag (CM-803): its fields, who raised it, Solved On / By,
 * Closed On / By, the Inspection Request it was raised from, its images
 * and attachments, the **Progress** thread (comment and images; the author
 * deletes their own within 24 hours) and the lifecycle history. Actions
 * by the viewer's flags: Mark As Solved, Verify, Reopen (with a reason),
 * Edit (while open) and Delete.
 */
export function IssueDetail({
  projectId,
  id,
}: {
  projectId: string;
  id: string;
}) {
  const router = useRouter();
  const { data: issue } = useSuspenseQuery(issueQuery(id));
  const { data: access } = useSuspenseQuery(trackingAccessQuery(projectId));
  const canAttach =
    canInTracking(access, "tracking.issues", "create") ||
    canInTracking(access, "tracking.issues", "update");
  const transition = useIssueTransition(issue.id);
  const remove = useDeleteIssue(issue.id);
  const [dialog, setDialog] = useState<"reopen" | "delete" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const listHref = issuesPath(projectId);
  const act = (action: "solve" | "verify") => {
    setError(null);
    transition.mutate(
      { action },
      {
        onError: (caught) => {
          setError(message(caught));
        },
      },
    );
  };
  const person = (value: { name: string | null } | null) =>
    value == null ? "—" : (value.name ?? "A former member");

  return (
    <div className="flex w-full max-w-6xl min-w-0 flex-col gap-4 p-6">
      <SiteRecordHeader
        back={{ label: "Issues & Snags", href: listHref }}
        size="detail"
        title={issue.number}
        meta={`Raised ${formatDate(issue.issueDate)}${issue.dueDate == null ? "" : ` · Due ${formatDate(issue.dueDate)}`}`}
        actions={
          <>
            <IssueStatusBadge status={issue.status} />
            {issue.priority != null && (
              <PriorityChip priority={issue.priority} />
            )}
            {issue.actions.solve && (
              <Button
                type="button"
                size="sm"
                disabled={transition.isPending}
                onClick={() => {
                  act("solve");
                }}
              >
                <CircleCheck aria-hidden="true" />
                Mark As Solved
              </Button>
            )}
            {issue.actions.verify && (
              <Button
                type="button"
                size="sm"
                disabled={transition.isPending}
                onClick={() => {
                  act("verify");
                }}
              >
                <ShieldCheck aria-hidden="true" />
                Verify
              </Button>
            )}
            {issue.actions.reopen && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => {
                  setDialog("reopen");
                }}
              >
                <RotateCcw aria-hidden="true" />
                Reopen
              </Button>
            )}
            {issue.actions.edit && (
              <Link
                href={`${issuesPath(projectId, issue.id)}/edit`}
                className={buttonVariants({ size: "sm", variant: "outline" })}
              >
                <Pencil aria-hidden="true" />
                Edit
              </Link>
            )}
            {issue.actions.delete && (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="text-destructive"
                onClick={() => {
                  setDialog("delete");
                }}
              >
                <Trash2 aria-hidden="true" />
                Delete
              </Button>
            )}
          </>
        }
      />

      <FormAlert message={error ?? undefined} />

      <div className="w-full max-w-4xl min-w-0 space-y-6">
        {issue.sourceInspection != null && (
          <p className="bg-muted/50 rounded-lg border px-3 py-2 text-sm">
            Raised from{" "}
            <Link
              href={trackingRecordPath(
                projectId,
                "inspection",
                issue.sourceInspection.id,
              )}
              className="font-medium underline-offset-4 hover:underline"
            >
              {issue.sourceInspection.number}
            </Link>
          </p>
        )}
        <dl className="grid gap-4 rounded-lg border p-4 sm:grid-cols-3">
          <Fact label="Details" className="sm:col-span-3">
            {issue.details}
          </Fact>
          <Fact label="Issue Date">{formatDate(issue.issueDate)}</Fact>
          <Fact label="Due Date">
            {issue.dueDate == null ? "—" : formatDate(issue.dueDate)}
          </Fact>
          <Fact label="Priority">
            {issue.priority == null ? (
              "—"
            ) : (
              <PriorityChip priority={issue.priority} />
            )}
          </Fact>
          <Fact label="Category">{issue.category?.name ?? "—"}</Fact>
          <Fact label="Department">{issue.department?.name ?? "—"}</Fact>
          <Fact label="Contractor">{issue.contractor?.name ?? "—"}</Fact>
          <Fact label="Assigned to">{person(issue.assignee)}</Fact>
          <Fact label="Location">
            {issue.siteLocation == null ? (
              "—"
            ) : (
              <Suspense fallback={<FactValueSkeleton />}>
                <LocationLabel
                  projectId={projectId}
                  value={issue.siteLocation}
                />
              </Suspense>
            )}
          </Fact>
          <Fact label="Created By">
            {person(issue.createdBy)} · {formatDateTime(issue.createdAt)}
          </Fact>
          {issue.solvedAt != null && (
            <Fact label="Solved On">
              {formatDateTime(issue.solvedAt)} · {person(issue.solvedBy)}
            </Fact>
          )}
          {issue.closedAt != null && (
            <Fact label="Closed On">
              {formatDateTime(issue.closedAt)} · {person(issue.closedBy)}
            </Fact>
          )}
        </dl>

        <TrackingDocumentFiles
          documentType="issue"
          documentId={issue.id}
          canEdit={canAttach}
          heading="Images and attachments"
        />

        <Suspense
          fallback={
            <section className="min-w-0 space-y-3">
              <h3 className="text-sm font-semibold">Progress</h3>
              <UpdatesSkeleton />
            </section>
          }
        >
          <ProgressThread issue={issue} />
        </Suspense>

        <History issue={issue} />
      </div>

      {issue.actions.reopen && (
        <IssueReopenDialog
          issue={issue}
          open={dialog === "reopen"}
          onOpenChange={(open) => {
            setDialog(open ? "reopen" : null);
          }}
        />
      )}
      <AlertDialog
        open={dialog === "delete"}
        onOpenChange={(open) => {
          if (!open) setDialog(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {issue.number}?</AlertDialogTitle>
            <AlertDialogDescription>
              It leaves the list, the dashboard and the Gallery. The number is
              not used again.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep</AlertDialogCancel>
            <Button
              variant="destructive"
              disabled={remove.isPending}
              onClick={() => {
                setError(null);
                remove.mutate(issue.updatedAt, {
                  onSuccess: () => {
                    router.push(listHref);
                  },
                  onError: (caught) => {
                    setDialog(null);
                    setError(message(caught));
                  },
                });
              }}
            >
              Delete
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
