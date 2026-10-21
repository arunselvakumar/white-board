"use client";

import { useSuspenseQuery } from "@tanstack/react-query";
import { ListTodo, MoreHorizontal, Plus } from "lucide-react";
import { Suspense, useState } from "react";
import { Button } from "@repo/ui/components/button";
import { Checkbox } from "@repo/ui/components/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@repo/ui/components/dropdown-menu";
import { cn } from "@repo/ui/lib/utils";

import { FormAlert } from "@/components/auth/form-alert";
import { formatDate } from "@/components/payments/payment-format";
import { QueryHttpError } from "@/src/queries/http";
import {
  inquiryTasksQuery,
  useInquiryTaskCommand,
  type InquiryDetail,
  type InquiryTask,
} from "@/src/queries/sales-inquiries";

import { InquiryTaskDialog } from "./inquiry-task-dialog";

function message(caught: unknown): string {
  return caught instanceof QueryHttpError
    ? caught.message
    : "Something went wrong. Please try again.";
}

function TaskRow({
  task,
  today,
  canManage,
  busy,
  onToggle,
  onEdit,
  onDelete,
}: {
  task: InquiryTask;
  today: string;
  canManage: boolean;
  busy: boolean;
  onToggle: (done: boolean) => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const done = task.status === "done";
  const late = !done && task.dueDate != null && task.dueDate < today;
  return (
    <li className="flex min-w-0 items-start gap-3 py-2.5">
      <Checkbox
        className="mt-0.5"
        aria-label={
          done ? `Mark ${task.title} open` : `Mark ${task.title} done`
        }
        checked={done}
        disabled={!canManage || busy}
        onCheckedChange={(checked) => {
          onToggle(checked);
        }}
      />
      <div className="min-w-0 flex-1 space-y-0.5">
        <p
          className={cn(
            "text-sm break-words",
            done && "text-muted-foreground line-through",
          )}
        >
          {task.title}
        </p>
        <p className="text-muted-foreground text-xs">
          {[
            task.dueDate == null
              ? null
              : `${late ? "Overdue · " : "Due "}${formatDate(task.dueDate)}`,
            task.assignee == null
              ? null
              : (task.assignee.name ?? "A former member"),
            done && task.doneBy != null
              ? `Done by ${task.doneBy.name ?? "a former member"}`
              : null,
          ]
            .filter((part) => part != null)
            .join(" · ") || "No due date"}
        </p>
      </div>
      {canManage && (
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                disabled={busy}
                aria-label={`Actions for ${task.title}`}
              />
            }
          >
            <MoreHorizontal />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-40">
            <DropdownMenuItem onClick={onEdit}>Edit</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onClick={onDelete}>
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </li>
  );
}

function TaskList({
  projectId,
  inquiry,
  today,
}: {
  projectId: string;
  inquiry: InquiryDetail;
  today: string;
}) {
  const { data } = useSuspenseQuery(inquiryTasksQuery(inquiry.id));
  const command = useInquiryTaskCommand(inquiry.id);
  const [editing, setEditing] = useState<InquiryTask | "new" | null>(null);
  const [error, setError] = useState<string | undefined>();
  const busyId =
    command.isPending && "taskId" in command.variables
      ? command.variables.taskId
      : null;
  const run = (taskId: string, kind: "done" | "reopen" | "delete") => {
    setError(undefined);
    command.mutate(
      { kind, taskId },
      {
        onError: (caught) => {
          setError(message(caught));
        },
      },
    );
  };
  const open = data.items.filter((task) => task.status === "open").length;
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h3
          id="inquiry-tasks"
          className="flex items-center gap-2 text-sm font-semibold"
        >
          <ListTodo
            aria-hidden="true"
            className="text-muted-foreground size-4"
          />
          Tasks
          {open > 0 && (
            <span className="text-muted-foreground text-xs font-normal">
              {`${String(open)} open`}
            </span>
          )}
        </h3>
        {data.canManage && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => {
              setEditing("new");
            }}
          >
            <Plus aria-hidden="true" />
            Add task
          </Button>
        )}
      </div>
      {data.items.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          No tasks. Add to-dos like sending the brochure or a site visit.
        </p>
      ) : (
        <ul aria-label="Tasks" className="divide-y">
          {data.items.map((task) => (
            <TaskRow
              key={task.id}
              task={task}
              today={today}
              canManage={data.canManage}
              busy={busyId === task.id}
              onToggle={(done) => {
                run(task.id, done ? "done" : "reopen");
              }}
              onEdit={() => {
                setEditing(task);
              }}
              onDelete={() => {
                run(task.id, "delete");
              }}
            />
          ))}
        </ul>
      )}
      <FormAlert message={error} />
      {editing != null && (
        <InquiryTaskDialog
          projectId={projectId}
          inquiryId={inquiry.id}
          task={editing === "new" ? null : editing}
          onClose={() => {
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}

/**
 * An inquiry's to-dos (CM-1004, ADR CM-0022 §5): Title, Due date and
 * Assignee, ticked Done with who and when. With Inquiry Update a member
 * adds, edits, ticks and deletes them. They are not the Project's Tasks.
 */
export function InquiryTasksPanel({
  projectId,
  inquiry,
  today,
}: {
  projectId: string;
  inquiry: InquiryDetail;
  today: string;
}) {
  return (
    <aside
      aria-labelledby="inquiry-tasks"
      className="bg-card h-fit min-w-0 rounded-lg border p-4"
    >
      <Suspense fallback={<p className="text-sm">Loading tasks…</p>}>
        <TaskList projectId={projectId} inquiry={inquiry} today={today} />
      </Suspense>
    </aside>
  );
}
