import { materialCategoryRoutes } from "./material-category-routes";

export const dynamic = "force-dynamic";

/** Material Categories of the Active Company, newest first in cursor pages; `?status=enabled` for pickers. */
export const GET = materialCategoryRoutes.list;

/** Adds a Material Category. 409 when a live one has the name. */
export const POST = materialCategoryRoutes.create;
