"use client";

import { useSuspenseQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  Eye,
  FileSearch,
  FlaskConical,
  MoreHorizontal,
  Pencil,
  Plus,
  Search,
  Trash2,
} from "lucide-react";
import Link from "next/link";
import { useDeferredValue, useEffect, useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@repo/ui/components/alert-dialog";
import { Button, buttonVariants } from "@repo/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@repo/ui/components/dropdown-menu";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@repo/ui/components/empty";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@repo/ui/components/input-group";

import { FormAlert } from "@/components/auth/form-alert";
import { uploadErrorMessage } from "@/src/queries/direct-upload";
import {
  testingReportsQuery,
  useDeleteTestingReport,
  type TestingReport,
  type TestingReportFilter,
} from "@/src/queries/project-testing-reports";

import { FileThumbnail } from "../files/file-thumbnail";
import { FileViewer } from "../files/file-viewer";
import { TestingReportSheet } from "./testing-report-sheet";
import { reportCountLabel } from "./testing-reports-page";

const SEARCH_DELAY_MS = 300;

const CALENDAR = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

/** `2026-03-04` → "4 Mar 2026". */
export function formatReportDate(date: string): string {
  return CALENDAR.format(new Date(`${date}T00:00:00Z`));
}

/** "4 Mar 2026 · Karthik R", or the date alone without an uploader. */
function reportMeta(report: TestingReport): string {
  return [formatReportDate(report.reportDate), report.createdByName]
    .filter((part) => part != null && part.length > 0)
    .join(" · ");
}

function ReportRow({
  report,
  canUpdate,
  canDelete,
  onView,
  onEdit,
  onDelete,
}: {
  report: TestingReport;
  canUpdate: boolean;
  canDelete: boolean;
  onView: (report: TestingReport) => void;
  onEdit: (report: TestingReport) => void;
  onDelete: (report: TestingReport) => void;
}) {
  const name = report.name;
  return (
    <li className="flex items-start gap-3 px-3 py-3 sm:px-4">
      <FileThumbnail
        file={{
          name: report.fileName,
          url: report.url,
          contentType: report.contentType,
          thumbUrl: report.thumbUrl,
        }}
        className="size-12 shrink-0"
      />
      <div className="min-w-0 flex-1 space-y-0.5">
        <p className="truncate text-sm font-medium" title={name}>
          {name}
        </p>
        <p className="text-muted-foreground truncate text-xs">
          {reportMeta(report)}
        </p>
        {report.remark == null ? null : (
          <p className="text-muted-foreground line-clamp-2 text-xs break-words">
            {report.remark}
          </p>
        )}
      </div>
      <div className="hidden shrink-0 items-center gap-1 sm:flex">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          aria-label={`View ${name}`}
          onClick={() => {
            onView(report);
          }}
        >
          <Eye aria-hidden="true" />
          View
        </Button>
        {canUpdate ? (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={`Edit ${name}`}
            onClick={() => {
              onEdit(report);
            }}
          >
            <Pencil />
          </Button>
        ) : null}
        {canDelete ? (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={`Delete ${name}`}
            className="text-muted-foreground hover:text-destructive"
            onClick={() => {
              onDelete(report);
            }}
          >
            <Trash2 />
          </Button>
        ) : null}
      </div>
      <div className="shrink-0 sm:hidden">
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                variant="ghost"
                size="icon"
                aria-label={`Actions for ${name}`}
              />
            }
          >
            <MoreHorizontal />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              onClick={() => {
                onView(report);
              }}
            >
              <Eye aria-hidden="true" />
              View
            </DropdownMenuItem>
            {canUpdate ? (
              <DropdownMenuItem
                onClick={() => {
                  onEdit(report);
                }}
              >
                <Pencil aria-hidden="true" />
                Edit
              </DropdownMenuItem>
            ) : null}
            {canDelete ? (
              <DropdownMenuItem
                variant="destructive"
                onClick={() => {
                  onDelete(report);
                }}
              >
                <Trash2 aria-hidden="true" />
                Delete
              </DropdownMenuItem>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </li>
  );
}

function DeleteReportDialog({
  projectId,
  report,
  onClose,
}: {
  projectId: string;
  report: TestingReport | null;
  onClose: () => void;
}) {
  const removal = useDeleteTestingReport(projectId);
  // Keep the name on screen while the dialog animates closed.
  const [last, setLast] = useState(report);
  if (report != null && report !== last) setLast(report);
  const shown = report ?? last;
  return (
    <AlertDialog
      open={report != null}
      onOpenChange={(open) => {
        if (!open) {
          removal.reset();
          onClose();
        }
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="break-words">
            Delete {shown?.name}?
          </AlertDialogTitle>
          <AlertDialogDescription>
            The report and its file are removed for everyone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        {removal.isError ? (
          <FormAlert
            message={uploadErrorMessage(
              removal.error,
              "Couldn't delete. Try again.",
            )}
          />
        ) : null}
        <AlertDialogFooter>
          <AlertDialogCancel>Keep it</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={removal.isPending}
            onClick={() => {
              if (report == null) return;
              removal.mutate(report.id, {
                onSuccess: () => {
                  removal.reset();
                  onClose();
                },
              });
            }}
          >
            {removal.isPending ? "Deleting…" : "Delete"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/**
 * One testing material's reports (CM-409), newest report date first:
 * search by name, page with Previous and Next, view a report's file, and
 * add, edit or delete reports as the Testing reports menu's flags allow.
 */
export function TestingItemPage({
  projectId,
  itemId,
  canCreate,
  canUpdate,
  canDelete,
  today,
}: {
  projectId: string;
  itemId: string;
  /** Add report. */
  canCreate: boolean;
  /** Edit a report or replace its file. */
  canUpdate: boolean;
  /** Delete a report. */
  canDelete: boolean;
  /** `YYYY-MM-DD` for a new report's date; defaults to today on this device. */
  today?: string;
}) {
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState<TestingReportFilter["cursor"]>(null);
  const [viewing, setViewing] = useState<TestingReport | null>(null);
  const [editing, setEditing] = useState<TestingReport | null>(null);
  const [adding, setAdding] = useState(false);
  const [deleting, setDeleting] = useState<TestingReport | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      setQuery(search.trim());
    }, SEARCH_DELAY_MS);
    return () => {
      clearTimeout(timer);
    };
  }, [search]);

  // Keep the list on screen while the next search or page loads.
  const shownQuery = useDeferredValue(query);
  const shownCursor = useDeferredValue(cursor);
  const { data } = useSuspenseQuery(
    testingReportsQuery(projectId, itemId, {
      search: shownQuery,
      cursor: shownCursor,
    }),
  );
  const item = data.item;
  const listHref = `/app/projects/${encodeURIComponent(projectId)}/testing-reports`;
  const searching = shownQuery.length > 0;

  const addButton = (
    <Button
      type="button"
      onClick={() => {
        setAdding(true);
      }}
    >
      <Plus aria-hidden="true" />
      Add report
    </Button>
  );

  return (
    <div className="w-full max-w-5xl space-y-5 p-6">
      <Link
        href={listHref}
        className={buttonVariants({
          variant: "link",
          className:
            "text-muted-foreground hover:text-foreground h-auto gap-1.5 p-0 text-sm font-normal",
        })}
      >
        <ArrowLeft aria-hidden="true" />
        Back to Testing reports
      </Link>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-1">
          <h2 className="min-w-0 font-semibold break-words">{item.name}</h2>
          <p className="text-muted-foreground text-sm tabular-nums">
            {reportCountLabel(item.reportCount)}
          </p>
        </div>
        {canCreate && item.reportCount > 0 ? addButton : null}
      </div>

      {item.reportCount === 0 ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <FlaskConical />
            </EmptyMedia>
            <EmptyTitle>No reports for {item.name} yet</EmptyTitle>
            <EmptyDescription>
              {canCreate
                ? "Add each lab report as a PDF or a photo, with its date and result."
                : "Lab reports for this material show here."}
            </EmptyDescription>
          </EmptyHeader>
          {canCreate ? <EmptyContent>{addButton}</EmptyContent> : null}
        </Empty>
      ) : (
        <>
          <InputGroup className="h-9 sm:max-w-xs">
            <InputGroupAddon>
              <Search aria-hidden="true" />
            </InputGroupAddon>
            <InputGroupInput
              type="search"
              aria-label="Search reports"
              placeholder="Search report name"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setCursor(null);
              }}
            />
          </InputGroup>

          {data.items.length === 0 ? (
            <Empty className="border">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <FileSearch />
                </EmptyMedia>
                <EmptyTitle>
                  {searching
                    ? `No reports match “${shownQuery}”`
                    : "No reports on this page"}
                </EmptyTitle>
                <EmptyDescription>
                  {searching
                    ? "Search looks at the report name."
                    : "They were deleted while you looked."}
                </EmptyDescription>
              </EmptyHeader>
              <EmptyContent>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setSearch("");
                    setQuery("");
                    setCursor(null);
                  }}
                >
                  {searching ? "Clear search" : "Back to the first page"}
                </Button>
              </EmptyContent>
            </Empty>
          ) : (
            <>
              <ul
                aria-label="Reports"
                className="divide-border bg-card divide-y rounded-lg border"
              >
                {data.items.map((report) => (
                  <ReportRow
                    key={report.id}
                    report={report}
                    canUpdate={canUpdate}
                    canDelete={canDelete}
                    onView={setViewing}
                    onEdit={setEditing}
                    onDelete={setDeleting}
                  />
                ))}
              </ul>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-muted-foreground text-sm tabular-nums">
                  Showing {String(data.items.length)} of {String(data.total)}
                  {searching ? " matching" : ""}
                </p>
                {data.prevCursor != null || data.nextCursor != null ? (
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={data.prevCursor == null}
                      onClick={() => {
                        if (data.prevCursor != null)
                          setCursor({ before: data.prevCursor });
                      }}
                    >
                      Previous
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={data.nextCursor == null}
                      onClick={() => {
                        if (data.nextCursor != null)
                          setCursor({ after: data.nextCursor });
                      }}
                    >
                      Next
                    </Button>
                  </div>
                ) : null}
              </div>
            </>
          )}
          <p className="text-muted-foreground text-xs">
            Files aren&apos;t scanned. Only open files from people you trust.
          </p>
        </>
      )}

      <FileViewer
        file={
          viewing == null
            ? null
            : {
                name: viewing.fileName,
                url: viewing.url,
                contentType: viewing.contentType,
              }
        }
        description={
          viewing == null
            ? null
            : `${viewing.name} · ${formatReportDate(viewing.reportDate)}`
        }
        onClose={() => {
          setViewing(null);
        }}
      />
      {canCreate || canUpdate ? (
        <TestingReportSheet
          projectId={projectId}
          itemId={itemId}
          open={adding || editing != null}
          report={editing}
          today={today}
          onClose={() => {
            setAdding(false);
            setEditing(null);
          }}
        />
      ) : null}
      {canDelete ? (
        <DeleteReportDialog
          projectId={projectId}
          report={deleting}
          onClose={() => {
            setDeleting(null);
          }}
        />
      ) : null}
    </div>
  );
}
