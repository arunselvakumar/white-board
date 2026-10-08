import { departmentRoutes } from "./department-routes";

export const dynamic = "force-dynamic";

/** Every live Department of the Active Company, by name; `?status=enabled` for pickers. */
export const GET = departmentRoutes.list;

/** Adds a Department. 409 when a live one has the name. */
export const POST = departmentRoutes.create;
