import { departmentRoutes } from "../../department-routes";

export const dynamic = "force-dynamic";

/** Deletes a Department (a tombstone). 409 while something uses it. */
export const POST = departmentRoutes.delete;
