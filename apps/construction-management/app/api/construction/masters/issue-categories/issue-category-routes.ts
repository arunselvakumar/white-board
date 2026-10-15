import { toIssueCategoryResponse } from "../_lib/tracking-master-models";
import { trackingMasterRoutes } from "../_lib/tracking-master-routes";
import {
  CreateConstructionMastersIssueCategoryRequestModel,
  UpdateConstructionMastersIssueCategoryRequestModel,
} from "./issue-category-models";

/**
 * Issue Categories under the `masters.issue_categories` Menu (CM-801):
 * renamed and disabled (seeds too), deleted only while no live issue names
 * one.
 */
export const issueCategoryRoutes = trackingMasterRoutes({
  kind: "issue_category",
  menu: "masters.issue_categories",
  createModel: CreateConstructionMastersIssueCategoryRequestModel,
  updateModel: UpdateConstructionMastersIssueCategoryRequestModel,
  toResponse: toIssueCategoryResponse,
});
