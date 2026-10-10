import { resourceKindRoutes } from "../handlers";

export const dynamic = "force-dynamic";

/**
 * Replaces the Contractors on the Project, written by the masters context.
 */
export const POST = resourceKindRoutes("contractors").set;
