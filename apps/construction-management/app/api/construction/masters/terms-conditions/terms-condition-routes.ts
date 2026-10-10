import { createTermsConditionHandlers } from "@/src/masters/infrastructure/create-material-handlers";

import { listParams, pagedMasterRoutes } from "../_lib/paged-master-routes";
import {
  CreateConstructionMastersTermsConditionRequestModel,
  ListConstructionMastersTermsConditionsQueryModel,
  UpdateConstructionMastersTermsConditionRequestModel,
  toTermsConditionResponse,
} from "./terms-condition-models";

const handlers = createTermsConditionHandlers();

/** Terms & Conditions under the `masters.terms_conditions` Menu (CM-501). */
export const termsConditionRoutes = pagedMasterRoutes({
  menu: "masters.terms_conditions",
  listQuery: ListConstructionMastersTermsConditionsQueryModel,
  createModel: CreateConstructionMastersTermsConditionRequestModel,
  updateModel: UpdateConstructionMastersTermsConditionRequestModel,
  toResponse: toTermsConditionResponse,
  list: (session, query) =>
    handlers.list(listParams(session.workspaceId, query)),
  get: (target) => handlers.get(target.workspaceId, target.id),
  create: (session, body) =>
    handlers.create({
      workspaceId: session.workspaceId,
      title: body.title,
      body: body.body,
      by: session.userId,
    }),
  update: (target, body) =>
    handlers.update({
      ...target,
      title: body.title,
      body: body.body,
      expectedUpdatedAt: new Date(body.expectedUpdatedAt),
    }),
  setDisabled: (target, disabled) =>
    handlers.setDisabled({ ...target, disabled }),
  delete: (target) => handlers.delete(target),
});
