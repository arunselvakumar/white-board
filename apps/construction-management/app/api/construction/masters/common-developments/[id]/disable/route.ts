import { commonDevelopmentRoutes } from "../../common-development-routes";

export const dynamic = "force-dynamic";

/** Takes a Common Development off the pickers; the Projects that have it keep it. */
export const POST = commonDevelopmentRoutes.disable;
