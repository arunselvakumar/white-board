"use client";

import { useSuspenseQuery } from "@tanstack/react-query";
import {
  CircleCheck,
  Copy,
  History,
  ListPlus,
  Pencil,
  Trash2,
  TrendingUp,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Suspense, useState, type ReactNode } from "react";
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

import { FormAlert } from "@/components/auth/form-alert";
import { LocationLabel } from "@/components/locations/location-picker";
import { formatDate } from "@/components/payments/payment-format";
import { SiteRecordHeader } from "@/components/site-work/site-record-header";
import { TrackingFileStrip } from "@/components/tracking/documents/tracking-file-strip";
import { QueryHttpError } from "@/src/queries/http";
import {
  taskActivityQuery,
  taskProgressQuery,
  taskQuery,
  tasksPath,
  useCopyTask,
  useDeleteProgress,
  useDeleteTasks,
  type TaskActivity,
  type TaskDetail as Detail,
  type TaskProgress,
} from "@/src/queries/tracking-tasks";

import {
  CompleteDialog,
  ProgressDialog,
  RebaselineDialog,
} from "./task-dialogs";
import {
  assigneeNames,
  dateRange,
  days,
  Fact,
  formatPercent,
  price,
  PRIORITY_LABELS,
  PriorityChip,
  quantity,
  TaskProgressBar,
  TaskStatusBadge,
  varianceText,
} from "./task-parts";
import { FactValueSkeleton } from "@/components/procurement/procurement-skeletons";
import {
  FeedSkeleton,
  UpdatesSkeleton,
} from "@/components/tracking/tracking-skeletons";

function problemOf(caught: unknown): string {
  return caught instanceof QueryHttpError
    ? caught.message
    : "Something went wrong. Please try again.";
}

const FIELD_LABELS: Record<string, string> = {
  name: "name",
  description: "description",
  startDate: "Start Date",
  dueDate: "Due Date",
  priority: "priority",
  siteLocation: "location",
  extraLocations: "other locations",
  departmentId: "Department",
  contractorId: "Contractor",
  tagIds: "tags",
  totalWork: "total work",
  totalPrice: "Total Price",
};

/** A payload value as text ("" when missing or not a scalar). */
function str(value: unknown): string {
  return typeof value === "string" || typeof value === "number"
    ? String(value)
    : "";
}

/** One line for an activity feed row. */
export function activityText(row: TaskActivity, unit: string | null): string {
  const p = row.payload ?? {};
  const amount = () =>
    typeof p["workQty"] === "string"
      ? `${p["workQty"]}${unit == null ? "" : ` ${unit}`}`
      : typeof p["progressPct"] === "number"
        ? `${String(p["progressPct"])} %`
        : "";
  const names = (key: string) =>
    ((p[key] as string[] | undefined) ?? [])
      .map((id) => row.memberNames[id] ?? "a former member")
      .join(", ");
  switch (row.kind) {
    case "created":
      return p["imported"] === true ? "Imported the task" : "Created the task";
    case "edited": {
      const fields = ((p["fields"] as string[] | undefined) ?? []).map(
        (field) => FIELD_LABELS[field] ?? field,
      );
      return fields.length === 0
        ? "Edited the task"
        : `Changed ${fields.join(", ")}`;
    }
    case "assignees_changed": {
      const parts = [];
      if (names("added") !== "") parts.push(`assigned ${names("added")}`);
      if (names("removed") !== "") parts.push(`unassigned ${names("removed")}`);
      const text = parts.join("; ");
      return text.charAt(0).toUpperCase() + text.slice(1);
    }
    case "rebaselined":
      return `Re-baselined to ${dateRange(
        (p["startDate"] as string | undefined) ?? null,
        (p["endDate"] as string | undefined) ?? null,
      )} (v${str(p["version"])}): ${str(p["reason"])}`;
    case "progress_recorded":
      return p["markedCompleted"] === true
        ? `Marked as completed with ${amount()}`
        : `Recorded ${amount()} on ${formatDate(str(p["progressDate"]))}`;
    case "progress_edited":
      return `Edited the update of ${formatDate(str(p["progressDate"]))} to ${amount()}`;
    case "progress_deleted":
      return `Deleted the update of ${formatDate(str(p["progressDate"]))}`;
    case "completed":
      return `Completed on ${formatDate(str(p["actualEnd"]))}`;
    case "reopened":
      return `Reopened at ${str(p["progressPct"]) || "0"} %`;
    case "subtask_added":
      return `Added sub-task T-${str(p["taskNo"])} ${str(p["name"])}`;
    case "copied":
      return `Copied from T-${str(p["fromTaskNo"])}`;
    case "worksheet_progress":
      if (p["removed"] === true)
        return `Daily Worksheet ${str(p["worksheetNumber"])} no longer counts: its ${amount()} was taken off`;
      return p["replaced"] === true
        ? `Daily Worksheet ${str(p["worksheetNumber"])} now records ${amount()} on ${formatDate(str(p["progressDate"]))}`
        : `Daily Worksheet ${str(p["worksheetNumber"])} recorded ${amount()} on ${formatDate(str(p["progressDate"]))}`;
  }
}

function Section({
  title,
  children,
  action,
}: {
  title: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <section aria-label={title} className="min-w-0 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">{title}</h3>
        {action}
      </div>
      {children}
    </section>
  );
}

function ProgressList({
  task,
  projectId,
}: {
  task: Detail;
  projectId: string;
}) {
  const { data } = useSuspenseQuery(taskProgressQuery(task.id));
  const remove = useDeleteProgress();
  const [editing, setEditing] = useState<TaskProgress | null>(null);
  const [deleting, setDeleting] = useState<TaskProgress | null>(null);
  const [error, setError] = useState<string | undefined>();
  if (data.items.length === 0)
    return (
      <p className="text-muted-foreground text-sm">No progress recorded yet.</p>
    );
  return (
    <>
      <FormAlert message={error} />
      <ul aria-label="Progress updates" className="space-y-2">
        {data.items.map((item) => (
          <li
            key={item.id}
            className="bg-card min-w-0 space-y-2 rounded-lg border p-3"
          >
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="font-medium">
                  {item.workQty != null
                    ? `+${quantity(item.workQty, task.unit)}`
                    : formatPercent(item.progressPct ?? 0)}
                  <span className="text-muted-foreground font-normal">
                    {" "}
                    · {formatDate(item.progressDate)}
                  </span>
                </p>
                <p className="text-muted-foreground text-xs">
                  {item.worksheet != null ? (
                    <>
                      From Daily Worksheet{" "}
                      <Link
                        href={`/app/projects/${encodeURIComponent(projectId)}/worksheets/${encodeURIComponent(item.worksheet.id)}`}
                        className="hover:underline"
                      >
                        {item.worksheet.number ?? ""}
                      </Link>
                    </>
                  ) : (
                    `By ${item.createdBy.name ?? "a former member"}`
                  )}
                </p>
              </div>
              {(item.actions.edit || item.actions.delete) && (
                <div className="flex gap-1">
                  {item.actions.edit && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Edit the update of ${formatDate(item.progressDate)}`}
                      onClick={() => {
                        setEditing(item);
                      }}
                    >
                      <Pencil aria-hidden="true" />
                    </Button>
                  )}
                  {item.actions.delete && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Delete the update of ${formatDate(item.progressDate)}`}
                      onClick={() => {
                        setDeleting(item);
                      }}
                    >
                      <Trash2 aria-hidden="true" />
                    </Button>
                  )}
                </div>
              )}
            </div>
            {item.remark != null && (
              <p className="text-sm break-words whitespace-pre-line">
                {item.remark}
              </p>
            )}
            <TrackingFileStrip
              files={item.photos}
              label={`Photos of the update on ${formatDate(item.progressDate)}`}
            />
          </li>
        ))}
      </ul>
      {editing != null && (
        <ProgressDialog
          key={editing.id}
          task={task}
          update={editing}
          open
          onClose={() => {
            setEditing(null);
          }}
        />
      )}
      <AlertDialog
        open={deleting != null}
        onOpenChange={(open) => {
          if (!open) setDeleting(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this progress update?</AlertDialogTitle>
            <AlertDialogDescription>
              Its photos go with it. The task&apos;s progress is worked out
              again, and it reopens if it falls below 100 %.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <Button
              type="button"
              variant="destructive"
              disabled={remove.isPending}
              onClick={() => {
                if (deleting == null) return;
                remove.mutate(deleting.id, {
                  onSuccess: () => {
                    setDeleting(null);
                  },
                  onError: (caught) => {
                    setError(problemOf(caught));
                    setDeleting(null);
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

function ActivityFeed({ task }: { task: Detail }) {
  const { data } = useSuspenseQuery(taskActivityQuery(task.id));
  if (data.items.length === 0)
    return <p className="text-muted-foreground text-sm">No activity yet.</p>;
  return (
    <ol aria-label="Activity" className="space-y-2 border-l pl-4">
      {data.items.map((row) => (
        <li key={row.id} className="text-sm">
          <p className="break-words">
            {activityText(row, task.unit?.name ?? null)}
          </p>
          <p className="text-muted-foreground text-xs">
            {row.createdBy.name ?? "A former member"} ·{" "}
            {new Intl.DateTimeFormat("en-IN", {
              day: "numeric",
              month: "short",
              hour: "numeric",
              minute: "2-digit",
            }).format(new Date(row.createdAt))}
          </p>
        </li>
      ))}
    </ol>
  );
}

/**
 * One task (CM-802): Task No., status and progress; planned, baseline and
 * actual dates with durations and variance; completed work and earned
 * value (Financial); its sub-tasks rolled up; the baseline history with
 * **Re-baseline**; progress updates with photos; the activity feed. Actions
 * follow the viewer's flags: Update Task Progress, Mark As Completed, Edit,
 * Add Sub-Task, Copy task, Delete.
 */
export function TaskDetail({
  projectId,
  id,
}: {
  projectId: string;
  id: string;
}) {
  const router = useRouter();
  const { data: task } = useSuspenseQuery(taskQuery(id));
  const copy = useCopyTask();
  const remove = useDeleteTasks(projectId);
  const [dialog, setDialog] = useState<
    "progress" | "complete" | "rebaseline" | "delete" | null
  >(null);
  const [error, setError] = useState<string | undefined>();
  const [leaving, setLeaving] = useState(false);
  const close = () => {
    setDialog(null);
  };
  const back =
    task.parents.length > 0
      ? (() => {
          const parent = task.parents[task.parents.length - 1];
          return {
            label: `T-${String(parent?.taskNo ?? "")} ${parent?.name ?? ""}`,
            href: tasksPath(projectId, parent?.id),
          };
        })()
      : { label: "Tasks", href: tasksPath(projectId) };
  const a = task.actions;

  return (
    <div className="flex w-full max-w-6xl min-w-0 flex-col gap-6 p-6">
      <SiteRecordHeader
        back={back}
        size="detail"
        title={`${task.label} ${task.name}`}
        meta={
          task.parents.length > 0
            ? `Sub-task of ${task.parents.map((p) => `T-${String(p.taskNo)}`).join(" › ")}`
            : undefined
        }
        actions={
          <>
            {a.recordProgress && (
              <Button
                type="button"
                size="sm"
                onClick={() => {
                  setDialog("progress");
                }}
              >
                <TrendingUp aria-hidden="true" />
                Update Task Progress
              </Button>
            )}
            {a.markCompleted && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => {
                  setDialog("complete");
                }}
              >
                <CircleCheck aria-hidden="true" />
                Mark As Completed
              </Button>
            )}
            {a.edit && (
              <Link
                href={`${tasksPath(projectId, task.id)}/edit`}
                className={buttonVariants({ size: "sm", variant: "outline" })}
              >
                <Pencil aria-hidden="true" />
                Edit
              </Link>
            )}
            {a.addSubTask && (
              <Link
                href={`${tasksPath(projectId)}/new?parentId=${task.id}`}
                className={buttonVariants({ size: "sm", variant: "outline" })}
              >
                <ListPlus aria-hidden="true" />
                Add Sub-Task
              </Link>
            )}
            {a.copy && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={copy.isPending || leaving}
                onClick={() => {
                  setError(undefined);
                  copy.mutate(task.id, {
                    onSuccess: (made) => {
                      setLeaving(true);
                      router.push(tasksPath(projectId, made.id));
                    },
                    onError: (caught) => {
                      setError(problemOf(caught));
                    },
                  });
                }}
              >
                <Copy aria-hidden="true" />
                Copy task below
              </Button>
            )}
            {a.delete && (
              <Button
                type="button"
                size="sm"
                variant="outline"
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
      <FormAlert message={error} />

      <section
        aria-label="Summary"
        className="bg-card min-w-0 space-y-4 rounded-lg border p-4"
      >
        <div className="flex flex-wrap items-center gap-3">
          <TaskStatusBadge status={task.status} />
          {task.priority != null && <PriorityChip priority={task.priority} />}
          <TaskProgressBar
            value={task.progressPct}
            label={`Progress of ${task.label}`}
            className="min-w-40 flex-1"
          />
        </div>
        <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          <Fact label="Planned">
            {dateRange(task.startDate, task.dueDate)}
            {task.plannedDuration != null && ` · ${days(task.plannedDuration)}`}
          </Fact>
          <Fact
            label={`Baseline${task.baselineVersion > 1 ? ` (v${String(task.baselineVersion)})` : ""}`}
          >
            {task.baselineStart == null
              ? "Not captured yet"
              : `${dateRange(task.baselineStart, task.baselineEnd)} · ${days(task.baselineDuration)}`}
          </Fact>
          <Fact label="Actual">
            {task.actualStart == null
              ? "Not started"
              : `${formatDate(task.actualStart)} – ${task.actualEnd == null ? "ongoing" : formatDate(task.actualEnd)}`}
          </Fact>
          <Fact label="Variance">{varianceText(task.variance)}</Fact>
          {task.kind === "quantity" && (
            <Fact label="Completed work">
              {quantity(task.completedWorkQty, task.unit)} of{" "}
              {quantity(task.totalWorkQty, task.unit)}
            </Fact>
          )}
          {task.kind === "percent" && (
            <Fact label="Records progress">As a percentage</Fact>
          )}
          {task.financial && (
            <>
              <Fact label="Total Price">{price(task.totalPrice)}</Fact>
              <Fact label="Completed Price">{price(task.completedPrice)}</Fact>
            </>
          )}
          {task.weighting != null && (
            <Fact label="Rolled up by">
              {task.weighting === "price" ? "Total Price" : "Planned duration"}
            </Fact>
          )}
          <Fact label="Assigned to">{assigneeNames(task.assignees)}</Fact>
          <Fact label="Priority">
            {task.priority == null ? "—" : PRIORITY_LABELS[task.priority]}
          </Fact>
          <Fact label="Department">{task.department?.name ?? "—"}</Fact>
          <Fact label="Contractor">{task.contractor?.name ?? "—"}</Fact>
          <Fact label="Tags">
            {task.tags.length === 0
              ? "—"
              : task.tags.map((t) => t.name ?? "A removed tag").join(", ")}
          </Fact>
          <Fact label="Location" className="col-span-2">
            {task.siteLocation == null ? (
              "—"
            ) : (
              <Suspense fallback={<FactValueSkeleton />}>
                <span className="flex flex-col">
                  <LocationLabel
                    projectId={projectId}
                    value={task.siteLocation}
                  />
                  {task.extraLocations.map((ref, index) => (
                    <LocationLabel
                      key={`${ref.type}-${String(index)}`}
                      projectId={projectId}
                      value={ref}
                    />
                  ))}
                </span>
              </Suspense>
            )}
          </Fact>
          <Fact label="Created by">
            {task.createdBy.name ?? "A former member"}
          </Fact>
          {task.description != null && (
            <Fact
              label="Description"
              className="col-span-2 sm:col-span-3 lg:col-span-4"
            >
              <span className="whitespace-pre-line">{task.description}</span>
            </Fact>
          )}
        </dl>
      </section>

      {task.isSummary && (
        <Section title="Sub-tasks">
          <ul aria-label="Sub-tasks" className="space-y-2">
            {task.children.map((child) => (
              <li
                key={child.id}
                className="bg-card min-w-0 space-y-1.5 rounded-lg border p-3"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <span className="text-muted-foreground mr-1.5 text-xs">
                      {child.label}
                    </span>
                    {child.contextOnly ? (
                      <span className="font-medium">{child.name}</span>
                    ) : (
                      <Link
                        href={tasksPath(projectId, child.id)}
                        className="font-medium hover:underline"
                      >
                        {child.name}
                      </Link>
                    )}
                  </div>
                  <TaskStatusBadge status={child.status} />
                </div>
                <p className="text-muted-foreground text-xs">
                  {dateRange(child.startDate, child.dueDate)}
                  {task.financial && child.totalPrice != null
                    ? ` · ${price(child.totalPrice)}`
                    : ""}
                </p>
                <TaskProgressBar
                  value={child.progressPct}
                  label={`Progress of ${child.label}`}
                  className="max-w-sm"
                />
              </li>
            ))}
          </ul>
        </Section>
      )}

      {!task.isSummary && (
        <Section
          title="Baseline history"
          action={
            a.rebaseline ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => {
                  setDialog("rebaseline");
                }}
              >
                <History aria-hidden="true" />
                Re-baseline
              </Button>
            ) : undefined
          }
        >
          {task.baselines.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              Captured once the task has a Start Date and a Due Date.
            </p>
          ) : (
            <ul aria-label="Baselines" className="space-y-2">
              {task.baselines.map((row) => (
                <li
                  key={row.id}
                  className="min-w-0 rounded-lg border p-3 text-sm"
                >
                  <p className="font-medium">
                    v{row.version}: {dateRange(row.startDate, row.endDate)} ·{" "}
                    {days(row.duration)}
                  </p>
                  <p className="text-muted-foreground text-xs break-words">
                    {row.reason ?? "Captured from the planned dates"} ·{" "}
                    {row.createdBy.name ?? "A former member"}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Section>
      )}

      {!task.isSummary && (
        <Section title="Progress">
          <Suspense fallback={<UpdatesSkeleton label="Loading progress" />}>
            <ProgressList task={task} projectId={projectId} />
          </Suspense>
        </Section>
      )}

      <Section title="Activity">
        <Suspense fallback={<FeedSkeleton />}>
          <ActivityFeed task={task} />
        </Suspense>
      </Section>

      {dialog === "progress" && (
        <ProgressDialog task={task} open onClose={close} />
      )}
      {dialog === "complete" && (
        <CompleteDialog task={task} open onClose={close} />
      )}
      {dialog === "rebaseline" && (
        <RebaselineDialog task={task} open onClose={close} />
      )}
      <AlertDialog
        open={dialog === "delete"}
        onOpenChange={(open) => {
          if (!open) close();
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {task.label}?</AlertDialogTitle>
            <AlertDialogDescription>
              {task.descendantCount > 0
                ? `Its ${String(task.descendantCount)} ${task.descendantCount === 1 ? "sub-task goes" : "sub-tasks go"} with it, with progress and photos.`
                : "Its progress and photos go with it."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <Button
              type="button"
              variant="destructive"
              disabled={remove.isPending || leaving}
              onClick={() => {
                remove.mutate([task.id], {
                  onSuccess: () => {
                    setLeaving(true);
                    router.push(back.href);
                  },
                  onError: (caught) => {
                    setError(problemOf(caught));
                    close();
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
