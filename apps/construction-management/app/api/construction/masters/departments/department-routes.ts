import {
  anyUsage,
  siteWorkDepartmentUsage,
} from "@/src/composition/site-work-usage";
import { trackingDepartmentUsage } from "@/src/composition/tracking-usage";

import { lookupRoutes } from "../_lib/lookup-routes";
import { DEPARTMENT_MODELS } from "./department-models";

/**
 * Departments under the `masters.departments` Menu (CM-203). Delete is
 * refused while a Work Type, a live worksheet or usage sheet, or a live
 * task, issue or inspection (CM-801) uses one.
 */
export const departmentRoutes = lookupRoutes({
  kind: "department",
  menu: "masters.departments",
  models: DEPARTMENT_MODELS,
  usage: anyUsage(siteWorkDepartmentUsage(), trackingDepartmentUsage()),
});
