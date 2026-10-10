import { materialRoutes } from "../../material-routes";

export const dynamic = "force-dynamic";

/** Deletes a Material (a tombstone); 409 while something uses it. */
export const POST = materialRoutes.delete;
