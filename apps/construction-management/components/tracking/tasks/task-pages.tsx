"use client";

import { useSuspenseQuery } from "@tanstack/react-query";

import { SiteRecordHeader } from "@/components/site-work/site-record-header";
import { taskQuery, tasksPath } from "@/src/queries/tracking-tasks";

import { TaskForm } from "./task-form";

function NewSubTask({
  projectId,
  parentId,
}: {
  projectId: string;
  parentId: string;
}) {
  const { data: parent } = useSuspenseQuery(taskQuery(parentId));
  return (
    <>
      <SiteRecordHeader
        back={{
          label: `${parent.label} ${parent.name}`,
          href: tasksPath(projectId, parent.id),
        }}
        title="Add Sub-Task"
      />
      <TaskForm
        projectId={projectId}
        parent={{ id: parent.id, label: parent.label, name: parent.name }}
      />
    </>
  );
}

/** Add a task, or with `parentId` a Sub-Task (CM-802). */
export function TaskNew({
  projectId,
  parentId,
}: {
  projectId: string;
  parentId?: string;
}) {
  return (
    <div className="flex w-full flex-col gap-4 p-6">
      <div className="flex w-full max-w-4xl flex-col gap-4">
        {parentId == null ? (
          <>
            <SiteRecordHeader
              back={{ label: "Tasks", href: tasksPath(projectId) }}
              title="Add Task"
            />
            <TaskForm projectId={projectId} />
          </>
        ) : (
          <NewSubTask projectId={projectId} parentId={parentId} />
        )}
      </div>
    </div>
  );
}

/** Edit a task (CM-802). */
export function TaskEdit({
  projectId,
  taskId,
}: {
  projectId: string;
  taskId: string;
}) {
  const { data } = useSuspenseQuery(taskQuery(taskId));
  return (
    <div className="flex w-full flex-col gap-4 p-6">
      <div className="flex w-full max-w-4xl flex-col gap-4">
        <SiteRecordHeader
          back={{
            label: `${data.label} ${data.name}`,
            href: tasksPath(projectId, taskId),
          }}
          title={`Edit ${data.label}`}
        />
        <TaskForm projectId={projectId} task={data} />
      </div>
    </div>
  );
}
