/**
 * Add Project's second step (CM-406, the legacy two-step wizard): a new
 * Project opens on its Resources with `?step=resources`, which shows the
 * "Step 2 of 2" banner. Plain module so the server page can read it.
 */
export const RESOURCES_STEP = "resources";

/** Where Add Project goes once the Project is saved. */
export function resourcesStepPath(projectId: string): string {
  return `/app/projects/${encodeURIComponent(projectId)}/resources?step=${RESOURCES_STEP}`;
}
