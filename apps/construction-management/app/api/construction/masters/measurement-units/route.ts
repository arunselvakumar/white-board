import { measurementUnitRoutes } from "./measurement-unit-routes";

export const dynamic = "force-dynamic";

/** Measurement Units of the Active Company, newest first in cursor pages; `?status=enabled` for pickers. */
export const GET = measurementUnitRoutes.list;

/** Adds a Measurement Unit. 409 when a live one has the name. */
export const POST = measurementUnitRoutes.create;
