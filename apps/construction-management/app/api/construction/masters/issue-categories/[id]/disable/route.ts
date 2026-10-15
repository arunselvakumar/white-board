import { issueCategoryRoutes } from "../../issue-category-routes";

export const dynamic = "force-dynamic";

/** Takes an Issue Category off the issue form's picker; old issues keep it. */
export const POST = issueCategoryRoutes.disable;
