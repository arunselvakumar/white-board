import { StatusCodes } from "http-status-codes";

import type {
  OpenApiComponents,
  OpenApiOperation,
} from "@/app/api/_lib/openapi";
import {
  ConstructionMastersIdParamsModel,
  ListConstructionMastersQueryModel,
} from "@/app/api/construction/masters/_lib/master-models";

import {
  ConstructionFinancePaymentCategoryResponseModel,
  CreateConstructionFinancePaymentCategoryRequestModel,
  ListConstructionFinancePaymentCategoriesResponseModel,
  UpdateConstructionFinancePaymentCategoryRequestModel,
} from "./payment-category-models";

const TAGS = ["Construction · Finance"];
const PATH = "/api/construction/finance/payment-categories";
const SESSION = [StatusCodes.UNAUTHORIZED, StatusCodes.FORBIDDEN];
const WRITE = [
  StatusCodes.BAD_REQUEST,
  ...SESSION,
  StatusCodes.PAYMENT_REQUIRED,
];
const params = ConstructionMastersIdParamsModel;

/** Payment Categories' Request and Response models (CM-704). */
export const paymentCategoryOpenApiComponents: OpenApiComponents = {
  ListConstructionFinancePaymentCategoriesResponseModel,
  ConstructionFinancePaymentCategoryResponseModel,
  CreateConstructionFinancePaymentCategoryRequestModel,
  UpdateConstructionFinancePaymentCategoryRequestModel,
};

/**
 * `/api/construction/finance/payment-categories` (CM-704, menu
 * `masters.payment_categories`). The `options` lookup is in
 * `lookups-openapi.ts`.
 */
export const paymentCategoryOpenApiOperations: OpenApiOperation[] = [
  {
    method: "get",
    path: PATH,
    summary:
      "Every live Payment Category of the Active Company by name, with Seed, Disabled and in-use flags; disabled ones included unless `status=enabled` (menu `masters.payment_categories`, read)",
    tags: TAGS,
    query: ListConstructionMastersQueryModel,
    successStatus: StatusCodes.OK,
    successDescription: "Payment Categories",
    successSchema: ListConstructionFinancePaymentCategoriesResponseModel,
    errors: [StatusCodes.BAD_REQUEST, ...SESSION],
  },
  {
    method: "post",
    path: PATH,
    summary:
      "Add a Payment Category (create; 409 PAYMENT_CATEGORY_NAME_TAKEN when a live one has the name in any case)",
    tags: TAGS,
    body: CreateConstructionFinancePaymentCategoryRequestModel,
    successStatus: StatusCodes.CREATED,
    successDescription: "The new Payment Category",
    successSchema: ConstructionFinancePaymentCategoryResponseModel,
    errors: [...WRITE, StatusCodes.CONFLICT],
  },
  {
    method: "get",
    path: `${PATH}/{id}`,
    summary: "One Payment Category, enabled or disabled (read)",
    tags: TAGS,
    params,
    successStatus: StatusCodes.OK,
    successDescription: "The Payment Category",
    successSchema: ConstructionFinancePaymentCategoryResponseModel,
    errors: [StatusCodes.BAD_REQUEST, ...SESSION, StatusCodes.NOT_FOUND],
  },
  {
    method: "post",
    path: `${PATH}/{id}/update`,
    summary:
      "Rename a Payment Category, a seed too, with the `updatedAt` you loaded (update; 409 PAYMENT_CATEGORY_CHANGED when stale, PAYMENT_CATEGORY_NAME_TAKEN)",
    tags: TAGS,
    params,
    body: UpdateConstructionFinancePaymentCategoryRequestModel,
    successStatus: StatusCodes.OK,
    successDescription: "The renamed Payment Category",
    successSchema: ConstructionFinancePaymentCategoryResponseModel,
    errors: [...WRITE, StatusCodes.NOT_FOUND, StatusCodes.CONFLICT],
  },
  {
    method: "post",
    path: `${PATH}/{id}/disable`,
    summary:
      "Take a Payment Category off the pickers (update); old documents keep it. Seeds are disabled, not deleted",
    tags: TAGS,
    params,
    successStatus: StatusCodes.OK,
    successDescription: "The disabled Payment Category",
    successSchema: ConstructionFinancePaymentCategoryResponseModel,
    errors: [...WRITE, StatusCodes.NOT_FOUND],
  },
  {
    method: "post",
    path: `${PATH}/{id}/enable`,
    summary: "Put a disabled Payment Category back on the pickers (update)",
    tags: TAGS,
    params,
    successStatus: StatusCodes.OK,
    successDescription: "The enabled Payment Category",
    successSchema: ConstructionFinancePaymentCategoryResponseModel,
    errors: [...WRITE, StatusCodes.NOT_FOUND],
  },
  {
    method: "post",
    path: `${PATH}/{id}/delete`,
    summary:
      "Delete a Company-made Payment Category (delete; a tombstone). 409 PAYMENT_CATEGORY_SEED for a seed, PAYMENT_CATEGORY_IN_USE while a Transaction, voucher, Other Expense, party payment or account entry names it",
    tags: TAGS,
    params,
    successStatus: StatusCodes.NO_CONTENT,
    successDescription: "Deleted",
    errors: [...WRITE, StatusCodes.NOT_FOUND, StatusCodes.CONFLICT],
  },
];
