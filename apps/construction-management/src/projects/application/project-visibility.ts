import { notFound } from "@/src/shared-kernel/domain-error";

import type { ProjectRepository } from "../domain/project-repository";
import type { ProjectViewer } from "./project-handlers";

export const projectNotFound = () =>
  notFound("PROJECT_NOT_FOUND", "This Project was not found.");

/**
 * Throws 404 `PROJECT_NOT_FOUND` unless the viewer may see this live
 * Project: the Owner sees every Project, a Member only those assigned to
 * them. Routes check the Permission Matrix first.
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
  if (found == null) throw projectNotFound();
}
