import { commonDevelopmentRoutes } from "../../common-development-routes";

export const dynamic = "force-dynamic";

/** Assigns a Common Development to exactly these Projects (among those the caller sees). */
export const POST = commonDevelopmentRoutes.assignProjects;
