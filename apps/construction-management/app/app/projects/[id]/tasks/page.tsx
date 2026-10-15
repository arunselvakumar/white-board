import type { Metadata } from "next";

import { viewerCan } from "@/app/app/_lib/viewer-can";
import { ProjectNoAccess } from "@/components/projects/files/project-no-access";
import { TasksPage } from "@/components/tracking/tasks/tasks-page";

export const metadata: Metadata = { title: "Tasks" };

/** The Project's task tree, Gantt and import (CM-802). */
export default async function TasksRoute({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ view?: string | string[] }>;
}) {
  const { id } = await params;
  const { view } = await searchParams;
  if (!(await viewerCan("tracking.tasks", "read", { projectId: id })))
    return <ProjectNoAccess what="Tasks" />;
  return (
    <TasksPage
      projectId={id}
      initialView={view === "gantt" ? "gantt" : "list"}
    />
  );
}
