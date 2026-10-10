import { developmentRoutes } from "../_lib/development-routes";
import { AMENITY_MODELS } from "./amenity-models";

/** Amenities under the `masters.amenities` Menu (CM-404). */
export const amenityRoutes = developmentRoutes({
  kind: "amenity",
  menu: "masters.amenities",
  models: AMENITY_MODELS,
});
