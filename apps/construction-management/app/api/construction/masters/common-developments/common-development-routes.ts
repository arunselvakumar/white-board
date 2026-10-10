import { developmentRoutes } from "../_lib/development-routes";
import { COMMON_DEVELOPMENT_MODELS } from "./common-development-models";

/** Common Developments under the `masters.common_developments` Menu (CM-404). */
export const commonDevelopmentRoutes = developmentRoutes({
  kind: "common_development",
  menu: "masters.common_developments",
  models: COMMON_DEVELOPMENT_MODELS,
});
