import { lookupRoutes } from "../_lib/lookup-routes";
import { DEPARTMENT_MODELS } from "./department-models";

/** Departments under the `masters.departments` Menu (CM-203). */
export const departmentRoutes = lookupRoutes({
  kind: "department",
  menu: "masters.departments",
  models: DEPARTMENT_MODELS,
});
