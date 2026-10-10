import { measurementUnitRoutes } from "../../measurement-unit-routes";

export const dynamic = "force-dynamic";

/** Takes a Measurement Unit off the pickers; what already uses it keeps it. */
export const POST = measurementUnitRoutes.disable;
