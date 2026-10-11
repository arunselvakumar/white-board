import { workTypeRoutes } from "../../work-type-routes";

export const dynamic = "force-dynamic";

/** Takes a Work Type off the pickers; old worksheets keep it. */
export const POST = workTypeRoutes.disable;
