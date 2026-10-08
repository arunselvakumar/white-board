import { supervisorRoutes } from "./supervisor-routes";

export const dynamic = "force-dynamic";

/** Every live Supervisor of the Active Company, by name; `?status=enabled` for pickers. */
export const GET = supervisorRoutes.list;

/** Adds a Supervisor. 409 when a live one has the name. */
export const POST = supervisorRoutes.create;
