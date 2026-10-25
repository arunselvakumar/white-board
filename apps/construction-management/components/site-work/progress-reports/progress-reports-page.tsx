"use client";

import { useSuspenseQuery } from "@tanstack/react-query";
import { FileText, NotebookText, Plus, RotateCw, Trash2 } from "lucide-react";
import { Suspense, useState } from "react";
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
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@repo/ui/components/empty";
import { Spinner } from "@repo/ui/components/spinner";

import { FormAlert } from "@/components/auth/form-alert";
import { formatDate } from "@/components/procurement/inventory/inventory-format";
import { QueryHttpError } from "@/src/queries/http";
import {
  isPreparing,
  progressReportsQuery,
  useCreateProgressReport,
  useDeleteProgressReport,
  useRetryProgressReport,
  type CreateProgressReportInput,
  type ProgressReport,
} from "@/src/queries/progress-reports";
import {
  canInSiteWork,
  siteWorkAccessQuery,
} from "@/src/queries/site-work-access";

import { CreateProgressReportDialog } from "./create-progress-report-dialog";
import { ProgressReportRowsSkeleton } from "@/components/site-work/site-work-skeletons";

const MENU = "site_work.progress_reports";

const requestedAt = new Intl.DateTimeFormat("en-IN", {
  day: "2-digit",
  month: "short",
  hour: "numeric",
  minute: "2-digit",
});

function message(caught: unknown): string {
  return caught instanceof QueryHttpError
    ? caught.message
    : "Something went wrong. Please try again.";
}

function filledBy(report: ProgressReport): string {
  if (report.filledBy == null) return "all Team Members";
  return report.filledBy.name ?? "a former member";
}

/** A DPR's number and date, or a Task Progress Report's period. */
function reportLabel(report: ProgressReport): {
  title: string;
  when: string;
} {
  if (report.kind === "task_progress_report")
    return {
      title: "Task Progress Report",
      when:
        report.from === report.to
          ? formatDate(report.from)
          : `${formatDate(report.from)} – ${formatDate(report.to)}`,
    };
  return {
    title: report.number ?? "Daily Progress Report",
    when: formatDate(report.date ?? report.from),
  };
}

function StatusBadge({ report }: { report: ProgressReport }) {
  if (report.status === "done") return <Badge variant="secondary">Ready</Badge>;
  if (report.status === "failed")
    return <Badge variant="destructive">Failed</Badge>;
  return (
    <Badge variant="outline" className="gap-1">
      <Spinner aria-hidden="true" className="size-3" />
      Preparing
    </Badge>
  );
}

function ReportItem({
  report,
  onDelete,
  onError,
}: {
  report: ProgressReport;
  onDelete: (report: ProgressReport) => void;
  onError: (message: string) => void;
}) {
  const retry = useRetryProgressReport(report.projectId);
  const { title, when } = reportLabel(report);
  const label = `${title} ${when}`;
  return (
    <li className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium break-all">{title}</span>
          <span className="text-sm">{when}</span>
          <StatusBadge report={report} />
        </div>
        <p className="text-muted-foreground text-sm">
          {report.kind === "task_progress_report"
            ? "Tasks by location"
            : `Filled by ${filledBy(report)}`}{" "}
          · requested by {report.requestedBy.name ?? "a former member"},{" "}
          {requestedAt.format(new Date(report.createdAt))}
        </p>
        {report.status === "failed" && report.error != null ? (
          <p className="text-destructive text-sm">{report.error}</p>
        ) : null}
        {report.status === "done" && !report.actions.download ? (
          <p className="text-muted-foreground text-xs">
            Shows hire cost: downloading it needs Financial on Equipment Usage.
          </p>
        ) : null}
      </div>
      <div className="flex flex-wrap gap-2">
        {report.download != null ? (
          <a
            href={report.download}
            download
            aria-label={`Download ${label}`}
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            <FileText aria-hidden="true" />
            PDF
          </a>
        ) : null}
        {report.actions.retry ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            aria-label={`Retry ${label}`}
            disabled={retry.isPending}
            onClick={() => {
              retry.mutate(report.id, {
                onError: (caught) => {
                  onError(message(caught));
                },
              });
            }}
          >
            {retry.isPending ? (
              <Spinner aria-hidden="true" />
            ) : (
              <RotateCw aria-hidden="true" />
            )}
            Retry
          </Button>
        ) : null}
        {report.actions.delete && !isPreparing(report) ? (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="text-destructive"
            aria-label={`Delete ${label}`}
            onClick={() => {
              onDelete(report);
            }}
          >
            <Trash2 aria-hidden="true" />
            Delete
          </Button>
        ) : null}
      </div>
    </li>
  );
}

function ReportList({
  projectId,
  onCreate,
  onError,
}: {
  projectId: string;
  onCreate: (() => void) | null;
  onError: (message: string) => void;
}) {
  const { data } = useSuspenseQuery(progressReportsQuery(projectId));
  const remove = useDeleteProgressReport(projectId);
  const [deleting, setDeleting] = useState<ProgressReport | null>(null);

  if (data.items.length === 0)
    return (
      <Empty className="bg-card border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <NotebookText />
          </EmptyMedia>
          <EmptyTitle>No Progress Reports yet</EmptyTitle>
          <EmptyDescription>
            Generate a Daily Progress Report for a day (its weather, labour,
            worksheets, equipment, materials, visitors and hindrances) or a Task
            Progress Report for a period, each as one PDF.
          </EmptyDescription>
        </EmptyHeader>
        {onCreate != null && (
          <EmptyContent>
            <Button type="button" onClick={onCreate}>
              <Plus aria-hidden="true" />
              Create new
            </Button>
          </EmptyContent>
        )}
      </Empty>
    );

  return (
    <>
      <ul
        aria-label="Progress Reports"
        className="bg-card divide-y rounded-xl border"
      >
        {data.items.map((report) => (
          <ReportItem
            key={report.id}
            report={report}
            onDelete={setDeleting}
            onError={onError}
          />
        ))}
      </ul>
      <AlertDialog
        open={deleting != null}
        onOpenChange={(open) => {
          if (!open) setDeleting(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Delete{" "}
              {deleting == null
                ? ""
                : deleting.kind === "task_progress_report"
                  ? `the Task Progress Report of ${reportLabel(deleting).when}`
                  : deleting.number}
              ?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {deleting?.kind === "task_progress_report"
                ? "The PDF is deleted."
                : "The PDF is deleted. Generating this date again keeps its number."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep</AlertDialogCancel>
            <Button
              variant="destructive"
              disabled={remove.isPending}
              onClick={() => {
                if (deleting == null) return;
                remove.mutate(deleting.id, {
                  onSettled: () => {
                    setDeleting(null);
                  },
                  onError: (caught) => {
                    onError(message(caught));
                  },
                });
              }}
            >
              Delete
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

/**
 * The Project's Progress Reports module (CM-606, CM-805): **Create new**
 * opens the dialog for a Daily Progress Report or a Task Progress Report;
 * **View Reports** lists the generated reports (a DPR's number and date or
 * a Task Progress Report's period, requested by, status), polling while
 * one is being prepared, with Download, Retry for a failed one, and Delete.
 */
export function ProgressReportsPage({ projectId }: { projectId: string }) {
  const { data: access } = useSuspenseQuery(siteWorkAccessQuery(projectId));
  const canCreate = canInSiteWork(access, MENU, "create");
  const create = useCreateProgressReport(projectId);
  const [open, setOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const submit = (input: Omit<CreateProgressReportInput, "projectId">) => {
    setOpen(false);
    setError(null);
    setNotice("The report is being prepared. It appears below when ready.");
    create.mutate(
      { ...input, projectId },
      {
        onSuccess: () => {
          setNotice(null);
        },
        onError: (caught) => {
          setNotice(null);
          setError(message(caught));
        },
      },
    );
  };

  return (
    <div className="flex w-full max-w-6xl flex-col gap-4 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-1">
          <h2 className="font-semibold">Progress Reports</h2>
          <p className="text-muted-foreground text-sm">
            Daily Progress Reports (the site diary of a day) and Task Progress
            Reports (each task&apos;s progress over a period), as PDFs.
          </p>
        </div>
        {canCreate && (
          <Button
            type="button"
            size="sm"
            onClick={() => {
              setOpen(true);
            }}
          >
            <Plus aria-hidden="true" />
            Create new
          </Button>
        )}
      </div>
      {notice != null && (
        <p
          role="status"
          className="bg-muted flex items-center gap-2 rounded-lg px-3 py-2 text-sm"
        >
          <Spinner aria-hidden="true" className="size-4" />
          {notice}
        </p>
      )}
      <FormAlert message={error ?? undefined} />
      <section aria-labelledby="view-reports" className="space-y-3">
        <h3 id="view-reports" className="text-sm font-medium">
          View Reports
        </h3>
        <Suspense fallback={<ProgressReportRowsSkeleton />}>
          <ReportList
            projectId={projectId}
            onCreate={
              canCreate
                ? () => {
                    setOpen(true);
                  }
                : null
            }
            onError={setError}
          />
        </Suspense>
      </section>
      {canCreate && (
        <CreateProgressReportDialog
          projectId={projectId}
          open={open}
          onOpenChange={setOpen}
          onSubmit={submit}
        />
      )}
    </div>
  );
}
