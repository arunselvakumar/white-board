import { resourceKindRoutes } from "../handlers";

export const dynamic = "force-dynamic";

/**
 * Replaces the Vendors on the Project, written by the labour context.
 */
export const POST = resourceKindRoutes("vendors").set;
