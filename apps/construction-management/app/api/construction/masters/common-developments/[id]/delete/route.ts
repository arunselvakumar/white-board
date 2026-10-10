import { commonDevelopmentRoutes } from "../../common-development-routes";

export const dynamic = "force-dynamic";

/** Deletes a Common Development (a tombstone). 409 while a Project has it. */
export const POST = commonDevelopmentRoutes.delete;
