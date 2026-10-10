import { measurementUnitRoutes } from "../../measurement-unit-routes";

export const dynamic = "force-dynamic";

/** Changes a Measurement Unit; carries the `updatedAt` it loaded (409 when stale). */
export const POST = measurementUnitRoutes.update;
