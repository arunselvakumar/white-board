import { labourCategoryRoutes } from "./labour-category-routes";

export const dynamic = "force-dynamic";

/** Every live Labour Category of the Active Company, by name; `?status=enabled` for pickers. */
export const GET = labourCategoryRoutes.list;

/** Adds a Labour Category. 409 when a live one has the name. */
export const POST = labourCategoryRoutes.create;
