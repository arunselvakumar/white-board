import { labourCategoryRoutes } from "../../labour-category-routes";

export const dynamic = "force-dynamic";

/** Changes a Labour Category; carries the `updatedAt` it loaded (409 when stale). */
export const POST = labourCategoryRoutes.update;
