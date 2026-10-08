import { labourCategoryRoutes } from "../../labour-category-routes";

export const dynamic = "force-dynamic";

/** Deletes a Labour Category (a tombstone). 409 while something uses it. */
export const POST = labourCategoryRoutes.delete;
