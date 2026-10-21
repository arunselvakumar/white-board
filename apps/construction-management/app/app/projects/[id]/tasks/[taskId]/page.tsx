import type { Metadata } from "next";

import { viewerCan } from "@/app/app/_lib/viewer-can";
import { ProjectNoAccess } from "@/components/projects/files/project-no-access";
import { TaskDetail } from "@/components/tracking/tasks/task-detail";
import { TaskDetailSkeleton } from "@/components/tracking/tracking-skeletons";
import { QuerySuspense } from "@/components/query-suspense";

export const metadata: Metadata = { title: "Task" };

/** One task (CM-802). */
export default async function TaskRoute({
  params,
}: {
  params: Promise<{ id: string; taskId: string }>;
}) {
  const { id, taskId } = await params;
  if (!(await viewerCan("tracking.tasks", "read", { projectId: id })))
    return <ProjectNoAccess what="Tasks" />;
  return (
    <QuerySuspense fallback={<TaskDetailSkeleton projectId={id} />}>
      <TaskDetail projectId={id} id={taskId} />
    </QuerySuspense>
  );
}
