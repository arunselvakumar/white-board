import { workTypeRoutes } from "../../work-type-routes";

export const dynamic = "force-dynamic";

/**
 * Changes a Work Type's name, Department and Materials; carries the
 * `updatedAt` it loaded (409 when stale). The seed keeps its name and
 * Department.
 */
export const POST = workTypeRoutes.update;
