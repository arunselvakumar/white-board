import { commonDevelopmentRoutes } from "./common-development-routes";

export const dynamic = "force-dynamic";

/** Every live Common Development of the Active Company, by name, with its Projects; `?status=enabled` for pickers. */
export const GET = commonDevelopmentRoutes.list;

/** Adds a Common Development, optionally on Projects. 409 when a live one has the name. */
export const POST = commonDevelopmentRoutes.create;
