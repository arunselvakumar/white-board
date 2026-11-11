import { siteEngineerRoutes } from "../handlers";

export const dynamic = "force-dynamic";

/**
 * Replaces the Site Engineers on the Project (Site Engineer ids), by
 * assigning their sign-ins; no other sign-in changes (ADR CM-0038 §3).
 */
export const POST = siteEngineerRoutes.set;
