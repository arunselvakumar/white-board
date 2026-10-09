import { departmentRoutes } from "../../department-routes";

export const dynamic = "force-dynamic";

/** Takes a Department off the pickers; old records keep it. */
export const POST = departmentRoutes.disable;
