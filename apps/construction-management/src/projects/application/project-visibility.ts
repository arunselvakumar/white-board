import { notFound } from "@/src/shared-kernel/domain-error";

import type { ProjectRepository } from "../domain/project-repository";
import type { ProjectViewer } from "./project-handlers";

/**
 * 404 `PROJECT_NOT_FOUND` unless the Project is live and the viewer may
 * see it: the Owner every Project, a Member only those assigned to them.
 */
export async function assertProjectVisible(
  projects: Pick<ProjectRepository, "findById">,
  viewer: ProjectViewer,
  projectId: string,
): Promise<void> {
  const visible = viewer.role === "owner" || viewer.projectIds.has(projectId);
  const found = visible
    ? await projects.findById(viewer.workspaceId, projectId)
    : null;
  if (found == null)
    throw notFound("PROJECT_NOT_FOUND", "This Project was not found.");
}
