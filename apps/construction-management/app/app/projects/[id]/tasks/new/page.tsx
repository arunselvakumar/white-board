import type { Metadata } from "next";

import { viewerCan } from "@/app/app/_lib/viewer-can";
import { ProjectNoAccess } from "@/components/projects/files/project-no-access";
import { TaskNew } from "@/components/tracking/tasks/task-pages";
import { TrackingFormSkeleton } from "@/components/tracking/tracking-skeletons";
import { QuerySuspense } from "@/components/query-suspense";

export const metadata: Metadata = { title: "Add Task" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Add a task; `?parentId=<task>` adds a Sub-Task under it (CM-802). */
export default async function TaskNewRoute({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ parentId?: string | string[] }>;
}) {
  const { id } = await params;
  const { parentId } = await searchParams;
  if (!(await viewerCan("tracking.tasks", "create", { projectId: id })))
    return <ProjectNoAccess what="adding tasks" />;
  return (
    <QuerySuspense
      fallback={
        <TrackingFormSkeleton
          kind="task"
          projectId={id}
          title={parentId === undefined ? "Add Task" : "Add Sub-Task"}
        />
      }
    >
      <TaskNew
        projectId={id}
        parentId={
          typeof parentId === "string" && UUID.test(parentId)
            ? parentId
            : undefined
        }
      />
    </QuerySuspense>
  );
}
