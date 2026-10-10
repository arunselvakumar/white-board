import { materialRoutes } from "../../material-routes";

export const dynamic = "force-dynamic";

/** Changes a Material; carries the `updatedAt` it loaded (409 when stale). */
export const POST = materialRoutes.update;
