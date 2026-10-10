import { materialRoutes } from "./material-routes";

export const dynamic = "force-dynamic";

/** Materials of the Active Company, newest first in cursor pages; `?status=enabled` for pickers. */
export const GET = materialRoutes.list;

/** Adds a Material. 409 when a live one has the name. */
export const POST = materialRoutes.create;
