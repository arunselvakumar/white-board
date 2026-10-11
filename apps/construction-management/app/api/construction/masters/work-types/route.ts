import { workTypeRoutes } from "./work-type-routes";

export const dynamic = "force-dynamic";

/** Every live Work Type of the Active Company, by name; `?status=enabled` for pickers. */
export const GET = workTypeRoutes.list;

/** Adds a Work Type. 409 when a live one has the name. */
export const POST = workTypeRoutes.create;
