import { siteWorkDepartmentUsage } from "@/src/composition/site-work-usage";

import { lookupRoutes } from "../_lib/lookup-routes";
import { DEPARTMENT_MODELS } from "./department-models";

/**
 * Departments under the `masters.departments` Menu (CM-203). Delete is
 * refused while a Work Type or a live worksheet or usage sheet uses one.
 */
export const departmentRoutes = lookupRoutes({
  kind: "department",
  menu: "masters.departments",
  models: DEPARTMENT_MODELS,
  usage: siteWorkDepartmentUsage(),
});
