import { supervisorRoutes } from "../../supervisor-routes";

export const dynamic = "force-dynamic";

/** Deletes a Supervisor (a tombstone). 409 while something uses it. */
export const POST = supervisorRoutes.delete;
