"use client";

import { useSuspenseQuery } from "@tanstack/react-query";
import {
  ChevronDown,
  ChevronRight,
  ListTree,
  Plus,
  Trash2,
} from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
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
import { Checkbox } from "@repo/ui/components/checkbox";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@repo/ui/components/empty";
import { cn } from "@repo/ui/lib/utils";

import { FormAlert } from "@/components/auth/form-alert";
import { QueryHttpError } from "@/src/queries/http";
import {
  tasksFiltered,
  tasksPath,
  tasksQuery,
  useDeleteTasks,
  type Task,
  type TaskCursor,
  type TaskFilters,
} from "@/src/queries/tracking-tasks";

import {
  assigneeNames,
  dateRange,
  PriorityChip,
  TaskProgressBar,
  TaskStatusBadge,
} from "./task-parts";

type InUse = {
  worksheetCount: number;
  tasks: { id: string; taskNo: number; name: string; worksheetCount: number }[];
};

function deleteProblem(caught: unknown): {
  message: string;
  inUse: InUse | null;
} {
  if (!(caught instanceof QueryHttpError))
    return { message: "Something went wrong. Please try again.", inUse: null };
  return {
    message: caught.message,
    inUse: caught.code === "TASK_IN_USE" ? (caught.details as InUse) : null,
  };
}

/** The tasks a delete takes: the chosen ones and every sub-task under them. */
export function deleteCount(
  items: readonly Task[],
  chosen: ReadonlySet<string>,
) {
  const byId = new Map(items.map((item) => [item.id, item]));
  let tasks = 0;
  let subTasks = 0;
  for (const id of chosen) {
    const item = byId.get(id);
    if (item == null) continue;
    let parentId = item.parentId;
    let covered = false;
    while (parentId != null) {
      if (chosen.has(parentId)) covered = true;
      parentId = byId.get(parentId)?.parentId ?? null;
    }
    if (covered) continue;
    tasks += 1;
    subTasks += item.descendantCount;
  }
  return { tasks, subTasks };
}

function TaskRow({
  task,
  projectId,
  collapsed,
  onToggle,
  selectable,
  selected,
  onSelect,
}: {
  task: Task;
  projectId: string;
  collapsed: boolean;
  onToggle: () => void;
  selectable: boolean;
  selected: boolean;
  onSelect: (on: boolean) => void;
}) {
  const indent = (task.depth - 1) * 1.25;
  const muted = task.contextOnly || !task.matched;
  return (
    <li
      className={cn(
        "bg-card relative flex min-w-0 gap-2 rounded-lg border p-3",
        muted && "bg-muted/40",
      )}
      style={{ marginLeft: `${String(indent)}rem` }}
      aria-label={`${task.label} ${task.name}`}
    >
      <div className="flex shrink-0 items-start gap-1 pt-0.5">
        {selectable ? (
          <Checkbox
            aria-label={`Select ${task.label}`}
            checked={selected}
            onCheckedChange={(on) => {
              onSelect(on);
            }}
          />
        ) : (
          <span className="size-4" aria-hidden="true" />
        )}
        {task.childCount > 0 ? (
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            className="text-muted-foreground -my-0.5"
            aria-expanded={!collapsed}
            aria-label={`${collapsed ? "Expand" : "Collapse"} ${task.label}`}
            onClick={onToggle}
          >
            {collapsed ? (
              <ChevronRight aria-hidden="true" />
            ) : (
              <ChevronDown aria-hidden="true" />
            )}
          </Button>
        ) : (
          <span className="size-4" aria-hidden="true" />
        )}
      </div>
      <div className="min-w-0 flex-1 space-y-1.5">
        <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
          <div className={cn("min-w-0", task.contextOnly && "opacity-70")}>
            <span className="text-muted-foreground mr-1.5 text-xs font-medium tabular-nums">
              {task.label}
            </span>
            {task.contextOnly ? (
              <span className="font-medium break-words">{task.name}</span>
            ) : (
              <Link
                href={tasksPath(projectId, task.id)}
                className="focus-visible:ring-ring rounded-sm font-medium break-words outline-none hover:underline focus-visible:ring-2"
              >
                {task.name}
              </Link>
            )}
            {task.contextOnly && (
              <span className="text-muted-foreground ml-2 text-xs">
                (shown for context)
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {task.priority != null && <PriorityChip priority={task.priority} />}
            <TaskStatusBadge status={task.status} />
          </div>
        </div>
        <p className="text-muted-foreground text-xs">
          {assigneeNames(task.assignees)} ·{" "}
          {dateRange(task.startDate, task.dueDate)}
          {task.isSummary
            ? ` · ${String(task.descendantCount)} ${task.descendantCount === 1 ? "sub-task" : "sub-tasks"}`
            : ""}
        </p>
        <TaskProgressBar
          value={task.progressPct}
          label={`Progress of ${task.label}`}
          className="max-w-sm"
        />
      </div>
    </li>
  );
}

/**
 * The Project's task tree (CM-802, ADR CM-0019 §2, §5): Task No., name,
 * assignees, planned dates, progress and the derived status; sub-tasks
 * under their parent, expandable; ancestors shown for context greyed and
 * not openable. Members with Task Delete select tasks and delete them with
 * their sub-tasks, all or none.
 */
export function TaskTree({
  projectId,
  filters,
  canCreate,
  canDelete,
}: {
  projectId: string;
  filters: TaskFilters;
  canCreate: boolean;
  canDelete: boolean;
}) {
  const [cursor, setCursor] = useState<TaskCursor>(null);
  const { data } = useSuspenseQuery(tasksQuery(projectId, filters, cursor));
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [confirming, setConfirming] = useState(false);
  const [problem, setProblem] = useState<{
    message: string;
    inUse: InUse | null;
  } | null>(null);
  const remove = useDeleteTasks(projectId);

  const visible = useMemo(() => {
    const byId = new Map(data.items.map((item) => [item.id, item]));
    return data.items.filter((item) => {
      let parentId = item.parentId;
      while (parentId != null) {
        if (collapsed.has(parentId)) return false;
        parentId = byId.get(parentId)?.parentId ?? null;
      }
      return true;
    });
  }, [data.items, collapsed]);

  const filtered = tasksFiltered(filters);
  if (data.items.length === 0)
    return (
      <Empty className="bg-card border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <ListTree />
          </EmptyMedia>
          <EmptyTitle>
            {filtered ? "No tasks match" : "No tasks yet"}
          </EmptyTitle>
          <EmptyDescription>
            {filtered
              ? "Try another status, assignee or date range."
              : "Plan the Project as tasks and sub-tasks with dates, work and price, then record progress as work gets done."}
          </EmptyDescription>
        </EmptyHeader>
        {!filtered && canCreate && (
          <EmptyContent>
            <Link
              href={`${tasksPath(projectId)}/new`}
              className={buttonVariants()}
            >
              <Plus aria-hidden="true" />
              Add Task
            </Link>
          </EmptyContent>
        )}
      </Empty>
    );

  const count = deleteCount(data.items, selected);
  const select = (id: string, on: boolean) => {
    setSelected((current) => {
      const next = new Set(current);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  return (
    <div className="space-y-3">
      <div className="flex min-h-8 flex-wrap items-center justify-between gap-2">
        <p className="text-muted-foreground text-sm">
          {data.total} {data.total === 1 ? "task" : "tasks"}
        </p>
        {selected.size > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-sm">{selected.size} selected</span>
            <Button
              type="button"
              size="sm"
              variant="destructive"
              onClick={() => {
                setProblem(null);
                setConfirming(true);
              }}
            >
              <Trash2 aria-hidden="true" />
              Delete
            </Button>
          </div>
        )}
      </div>
      <FormAlert message={problem?.message} />
      {problem?.inUse != null && (
        <ul
          aria-label="Tasks named by Daily Worksheets"
          className="bg-card space-y-1 rounded-lg border p-3 text-sm"
        >
          {problem.inUse.tasks.map((item) => (
            <li key={item.id}>
              T-{item.taskNo} {item.name}: {item.worksheetCount}{" "}
              {item.worksheetCount === 1 ? "worksheet" : "worksheets"}
            </li>
          ))}
        </ul>
      )}
      <ul aria-label="Tasks" className="space-y-2">
        {visible.map((task) => (
          <TaskRow
            key={task.id}
            task={task}
            projectId={projectId}
            collapsed={collapsed.has(task.id)}
            onToggle={() => {
              setCollapsed((current) => {
                const next = new Set(current);
                if (next.has(task.id)) next.delete(task.id);
                else next.add(task.id);
                return next;
              });
            }}
            selectable={canDelete && task.actions.delete}
            selected={selected.has(task.id)}
            onSelect={(on) => {
              select(task.id, on);
            }}
          />
        ))}
      </ul>
      {(data.prevCursor != null || data.nextCursor != null) && (
        <div className="flex justify-end gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={data.prevCursor == null}
            onClick={() => {
              if (data.prevCursor == null) return;
              // A selection is of the page on screen: the confirmation
              // counts it, and Delete removes it.
              setSelected(new Set());
              setCursor({ before: data.prevCursor });
            }}
          >
            Previous
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={data.nextCursor == null}
            onClick={() => {
              if (data.nextCursor == null) return;
              setSelected(new Set());
              setCursor({ after: data.nextCursor });
            }}
          >
            Next
          </Button>
        </div>
      )}
      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Delete {count.tasks} {count.tasks === 1 ? "task" : "tasks"}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {count.subTasks > 0
                ? `Their ${String(count.subTasks)} ${count.subTasks === 1 ? "sub-task goes" : "sub-tasks go"} with them, with their progress and photos. `
                : "Their progress and photos go with them. "}
              All are deleted, or none if a Daily Worksheet names one.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <Button
              type="button"
              variant="destructive"
              disabled={remove.isPending}
              onClick={() => {
                remove.mutate([...selected], {
                  onSuccess: () => {
                    setSelected(new Set());
                    setConfirming(false);
                  },
                  onError: (caught) => {
                    setProblem(deleteProblem(caught));
                    setConfirming(false);
                  },
                });
              }}
            >
              {remove.isPending ? "Deleting…" : "Delete"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
