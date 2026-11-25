import { workTypeRoutes } from "../../work-type-routes";

export const dynamic = "force-dynamic";

/**
 * Changes a Work Type's name and Materials; carries the `updatedAt` it
 * loaded (409 when stale). The seed keeps its name.
 */
export const POST = workTypeRoutes.update;
