import { departmentRoutes } from "../../department-routes";

export const dynamic = "force-dynamic";

/** Changes a Department; carries the `updatedAt` it loaded (409 when stale). */
export const POST = departmentRoutes.update;
