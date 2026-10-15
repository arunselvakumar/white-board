import { issueCategoryRoutes } from "../../issue-category-routes";

export const dynamic = "force-dynamic";

/** Renames a Issue Category; 409 when someone changed it meanwhile or the name is taken. */
export const POST = issueCategoryRoutes.update;
