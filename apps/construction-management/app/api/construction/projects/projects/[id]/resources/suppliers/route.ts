import { resourceKindRoutes } from "../handlers";

export const dynamic = "force-dynamic";

/**
 * Replaces the Suppliers on the Project, written by the masters context.
 */
export const POST = resourceKindRoutes("suppliers").set;
