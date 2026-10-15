import type { Metadata } from "next";

import { viewerCan } from "@/app/app/_lib/viewer-can";
import { ProjectNoAccess } from "@/components/projects/files/project-no-access";
import { TaskEdit } from "@/components/tracking/tasks/task-pages";

export const metadata: Metadata = { title: "Edit task" };

/** Edit a task (CM-802). */
export default async function TaskEditRoute({
  params,
}: {
  params: Promise<{ id: string; taskId: string }>;
}) {
  const { id, taskId } = await params;
  if (!(await viewerCan("tracking.tasks", "update", { projectId: id })))
    return <ProjectNoAccess what="editing tasks" />;
  return <TaskEdit projectId={id} taskId={taskId} />;
}
