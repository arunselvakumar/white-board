import { lookupRoutes } from "../_lib/lookup-routes";
import { LABOUR_CATEGORY_MODELS } from "./labour-category-models";

/** Labour Categories under the `masters.labour_categories` Menu. */
export const labourCategoryRoutes = lookupRoutes({
  kind: "labour_category",
  menu: "masters.labour_categories",
  models: LABOUR_CATEGORY_MODELS,
});
