import { measurementUnitRoutes } from "../../measurement-unit-routes";

export const dynamic = "force-dynamic";

/** Deletes a Measurement Unit (a tombstone); 409 while something uses it. */
export const POST = measurementUnitRoutes.delete;
