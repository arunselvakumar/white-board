import { type AppHref, pageHref } from "@/lib/page-href";

/**
 * Add Project's second step, as in the legacy two-step wizard: a new
 * Project opens on its Teams with `?step=teams`, which shows the
 * "Step 2 of 2" banner. Plain module so the server page can read it.
 */
export const RESOURCES_STEP = "teams";

/** Where Add Project goes once the Project is saved. */
export function resourcesStepPath(projectId: string): AppHref {
  return pageHref(
    "/app/projects/[id]/teams",
    { id: projectId },
    `?step=${RESOURCES_STEP}`,
  );
}
