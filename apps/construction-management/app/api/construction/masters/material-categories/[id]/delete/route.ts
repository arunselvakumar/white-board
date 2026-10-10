import { materialCategoryRoutes } from "../../material-category-routes";

export const dynamic = "force-dynamic";

/** Deletes a Material Category (a tombstone); 409 while something uses it. */
export const POST = materialCategoryRoutes.delete;
