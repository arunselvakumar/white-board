"use client";

import { useSuspenseQuery } from "@tanstack/react-query";
import { FileSpreadsheet, Plus } from "lucide-react";
import Link from "next/link";
import { Suspense, useDeferredValue, useState } from "react";
import { Button, buttonVariants } from "@repo/ui/components/button";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@repo/ui/components/tabs";
import { cn } from "@repo/ui/lib/utils";

import {
  canInTracking,
  trackingAccessQuery,
} from "@/src/queries/tracking-access";
import { tasksPath, type TaskFilters } from "@/src/queries/tracking-tasks";

import { ImportTasksDialog } from "./import-tasks-dialog";
import { TaskFilterBar } from "./task-filters";
import { TaskGantt } from "./task-gantt";
import { TaskTree } from "./task-tree";
import {
  TaskFilterBarSkeleton,
  TaskGanttSkeleton,
  TaskTreeSkeleton,
} from "@/components/tracking/tracking-skeletons";

/**
 * The Project's Tasks (CM-802): the task tree with filters, the Gantt, Add
 * Task and Import. Actions follow the viewer's Task flags.
 */
export function TasksPage({
  projectId,
  initialView = "list",
}: {
  projectId: string;
  initialView?: "list" | "gantt";
}) {
  const { data: access } = useSuspenseQuery(trackingAccessQuery(projectId));
  const [filters, setFilters] = useState<TaskFilters>({});
  const [importing, setImporting] = useState(false);
  const canCreate = canInTracking(access, "tracking.tasks", "create");
  const canDelete = canInTracking(access, "tracking.tasks", "delete");
  // Filter changes keep the old tree on screen, dimmed, until the new one
  // loads (ADR-0047); the search box stays live.
  const shown = useDeferredValue(filters);
  const key = JSON.stringify(shown);
  const stale = shown !== filters;

  return (
    <div className="flex w-full max-w-6xl min-w-0 flex-col gap-4 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-semibold">Tasks</h2>
        {canCreate && (
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setImporting(true);
              }}
            >
              <FileSpreadsheet aria-hidden="true" />
              Import
            </Button>
            <Link
              href={`${tasksPath(projectId)}/new`}
              className={buttonVariants({ size: "sm" })}
            >
              <Plus aria-hidden="true" />
              Add Task
            </Link>
          </div>
        )}
      </div>
      <Suspense fallback={<TaskFilterBarSkeleton />}>
        <TaskFilterBar
          projectId={projectId}
          filters={filters}
          onChange={(next) => {
            setFilters((current) => ({ ...current, ...next }));
          }}
        />
      </Suspense>
      <Tabs defaultValue={initialView} className="min-w-0 gap-4">
        <TabsList>
          <TabsTrigger value="list">List</TabsTrigger>
          <TabsTrigger value="gantt">Gantt</TabsTrigger>
        </TabsList>
        <TabsContent
          value="list"
          className={cn("min-w-0", stale && "opacity-60 transition-opacity")}
        >
          <Suspense fallback={<TaskTreeSkeleton />}>
            <TaskTree
              key={key}
              projectId={projectId}
              filters={shown}
              canCreate={canCreate}
              canDelete={canDelete}
            />
          </Suspense>
        </TabsContent>
        <TabsContent
          value="gantt"
          className={cn("min-w-0", stale && "opacity-60 transition-opacity")}
        >
          <Suspense fallback={<TaskGanttSkeleton />}>
            <TaskGantt projectId={projectId} filters={shown} />
          </Suspense>
        </TabsContent>
      </Tabs>
      {canCreate && (
        <ImportTasksDialog
          projectId={projectId}
          open={importing}
          onClose={() => {
            setImporting(false);
          }}
        />
      )}
    </div>
  );
}
