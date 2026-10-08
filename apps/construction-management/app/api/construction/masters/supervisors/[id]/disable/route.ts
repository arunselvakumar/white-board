import { supervisorRoutes } from "../../supervisor-routes";

export const dynamic = "force-dynamic";

/** Takes a Supervisor off the pickers; old records keep it. */
export const POST = supervisorRoutes.disable;
