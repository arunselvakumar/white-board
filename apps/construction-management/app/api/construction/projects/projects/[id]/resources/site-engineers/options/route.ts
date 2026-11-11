import { siteEngineerRoutes } from "../../handlers";

export const dynamic = "force-dynamic";

/** Enabled Site Engineers not on the Project; those without a sign-in flagged. */
export const GET = siteEngineerRoutes.options;
