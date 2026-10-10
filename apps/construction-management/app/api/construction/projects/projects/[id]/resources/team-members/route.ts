import { resourceKindRoutes } from "../handlers";

export const dynamic = "force-dynamic";

/**
 * Replaces the Team Members on the Project, written by the organization context (Assign Projects rules: HRMS Team Members are on no Project, the Owner is on every one).
 */
export const POST = resourceKindRoutes("team_members").set;
