import { masterRoutes } from "@/app/api/construction/masters/_lib/master-routes";
import {
  PaymentCategories,
  type PaymentCategoryView,
} from "@/src/finance/infrastructure/payment-categories";

import {
  CreateConstructionFinancePaymentCategoryRequestModel,
  UpdateConstructionFinancePaymentCategoryRequestModel,
  type ConstructionFinancePaymentCategoryResponseModel,
} from "./payment-category-models";

export function toPaymentCategoryResponse(
  item: PaymentCategoryView,
): ConstructionFinancePaymentCategoryResponseModel {
  return {
    id: item.id,
    name: item.name,
    isSeed: item.isSeed,
    disabled: item.disabled,
    inUse: item.inUse,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
  };
}

const categories = new PaymentCategories();

/**
 * Payment Categories under the `masters.payment_categories` menu (CM-704,
 * ADR CM-0017 §1): the masters' seven routes, served from finance.
 */
export const paymentCategoryRoutes = masterRoutes({
  menu: "masters.payment_categories",
  createModel: CreateConstructionFinancePaymentCategoryRequestModel,
  updateModel: UpdateConstructionFinancePaymentCategoryRequestModel,
  toResponse: toPaymentCategoryResponse,
  list: (workspaceId, status) => categories.list(workspaceId, status),
  get: (workspaceId, id) => categories.get(workspaceId, id),
  create: (session, body) =>
    categories.create({
      workspaceId: session.workspaceId,
      name: body.name,
      by: session.userId,
    }),
  update: (target, body) =>
    categories.rename({
      ...target,
      name: body.name,
      expectedUpdatedAt: new Date(body.expectedUpdatedAt),
    }),
  disable: (target) => categories.setDisabled({ ...target, disabled: true }),
  enable: (target) => categories.setDisabled({ ...target, disabled: false }),
  delete: (target) => categories.delete(target),
});
