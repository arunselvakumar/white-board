import { labourCategoryRoutes } from "../../labour-category-routes";

export const dynamic = "force-dynamic";

/** Takes a Labour Category off the pickers; old records keep it. */
export const POST = labourCategoryRoutes.disable;
