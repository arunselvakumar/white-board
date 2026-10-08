import { supervisorRoutes } from "../../supervisor-routes";

export const dynamic = "force-dynamic";

/** Changes a Supervisor; carries the `updatedAt` it loaded (409 when stale). */
export const POST = supervisorRoutes.update;
