import { materialCategoryRoutes } from "../../material-category-routes";

export const dynamic = "force-dynamic";

/** Changes a Material Category; carries the `updatedAt` it loaded (409 when stale). */
export const POST = materialCategoryRoutes.update;
