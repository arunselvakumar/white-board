import { materialCategoryRoutes } from "../../material-category-routes";

export const dynamic = "force-dynamic";

/** Takes a Material Category off the pickers; what already uses it keeps it. */
export const POST = materialCategoryRoutes.disable;
