import { materialRoutes } from "../../material-routes";

export const dynamic = "force-dynamic";

/** Takes a Material off the pickers; what already uses it keeps it. */
export const POST = materialRoutes.disable;
