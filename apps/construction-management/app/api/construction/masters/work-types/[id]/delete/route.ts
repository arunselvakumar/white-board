import { workTypeRoutes } from "../../work-type-routes";

export const dynamic = "force-dynamic";

/** Deletes a Work Type (a tombstone). 409 for the seed or while a worksheet uses it. */
export const POST = workTypeRoutes.delete;
