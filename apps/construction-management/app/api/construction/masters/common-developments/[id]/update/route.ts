import { commonDevelopmentRoutes } from "../../common-development-routes";

export const dynamic = "force-dynamic";

/** Renames a Common Development; carries the `updatedAt` it loaded (409 when stale). */
export const POST = commonDevelopmentRoutes.update;
