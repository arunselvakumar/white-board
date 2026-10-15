import { toTagResponse } from "../_lib/tracking-master-models";
import { trackingMasterRoutes } from "../_lib/tracking-master-routes";
import {
  CreateConstructionMastersTagRequestModel,
  UpdateConstructionMastersTagRequestModel,
} from "./tag-models";

/**
 * Tags under the `masters.tags` Menu (CM-801): added (or ensured inline
 * from the Task form), renamed, deleted only while no live task carries
 * one. Tags are never disabled.
 */
export const tagRoutes = trackingMasterRoutes({
  kind: "tag",
  menu: "masters.tags",
  createModel: CreateConstructionMastersTagRequestModel,
  updateModel: UpdateConstructionMastersTagRequestModel,
  toResponse: toTagResponse,
});
