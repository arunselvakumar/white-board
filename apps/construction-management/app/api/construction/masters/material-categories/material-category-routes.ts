import { createMaterialCategoryHandlers } from "@/src/masters/infrastructure/create-material-handlers";

import { listParams, pagedMasterRoutes } from "../_lib/paged-master-routes";
import {
  CreateConstructionMastersMaterialCategoryRequestModel,
  ListConstructionMastersMaterialCategoriesQueryModel,
  UpdateConstructionMastersMaterialCategoryRequestModel,
  toMaterialCategoryResponse,
} from "./material-category-models";

const handlers = createMaterialCategoryHandlers();

/** Material Categories under the `masters.material_categories` Menu (CM-501). */
export const materialCategoryRoutes = pagedMasterRoutes({
  menu: "masters.material_categories",
  listQuery: ListConstructionMastersMaterialCategoriesQueryModel,
  createModel: CreateConstructionMastersMaterialCategoryRequestModel,
  updateModel: UpdateConstructionMastersMaterialCategoryRequestModel,
  toResponse: toMaterialCategoryResponse,
  list: (session, query) =>
    handlers.list({
      ...listParams(session.workspaceId, query),
      topLevel: query.topLevel === "true",
      parentId: query.parentId,
    }),
  get: (target) => handlers.get(target.workspaceId, target.id),
  create: (session, body) =>
    handlers.create({
      workspaceId: session.workspaceId,
      name: body.name,
      parentId: body.parentId,
      by: session.userId,
    }),
  update: (target, body) =>
    handlers.update({
      ...target,
      name: body.name,
      parentId: body.parentId,
      expectedUpdatedAt: new Date(body.expectedUpdatedAt),
    }),
  setDisabled: (target, disabled) =>
    handlers.setDisabled({ ...target, disabled }),
  delete: (target) => handlers.delete(target),
});
