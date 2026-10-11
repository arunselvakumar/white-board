import { z } from "zod";

import { PAYMENT_CATEGORY_NAME_MAX } from "@/src/finance/domain/payment-category";

export const ConstructionFinancePaymentCategoryResponseModel = z.object({
  id: z.uuid(),
  name: z.string(),
  isSeed: z
    .boolean()
    .describe(
      'Came with the app ("Seed"): it can be renamed and disabled, never deleted.',
    ),
  disabled: z
    .boolean()
    .describe("Off the money forms' pickers; old documents keep it."),
  inUse: z
    .boolean()
    .describe(
      "A Transaction, petty-cash voucher, Other Expense, party payment or account entry names it, so it cannot be deleted.",
    ),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export type ConstructionFinancePaymentCategoryResponseModel = z.infer<
  typeof ConstructionFinancePaymentCategoryResponseModel
>;

export const ListConstructionFinancePaymentCategoriesResponseModel = z.object({
  items: z.array(ConstructionFinancePaymentCategoryResponseModel),
  total: z.int().nonnegative(),
});
export type ListConstructionFinancePaymentCategoriesResponseModel = z.infer<
  typeof ListConstructionFinancePaymentCategoriesResponseModel
>;

const name = z
  .string()
  .max(1000)
  .describe(
    `Trimmed; required and at most ${String(PAYMENT_CATEGORY_NAME_MAX)} characters (400 PAYMENT_CATEGORY_NAME_REQUIRED / PAYMENT_CATEGORY_NAME_TOO_LONG); unique among the Company's live categories ignoring case (409 PAYMENT_CATEGORY_NAME_TAKEN).`,
  );

export const CreateConstructionFinancePaymentCategoryRequestModel = z.object({
  name,
});
export type CreateConstructionFinancePaymentCategoryRequestModel = z.infer<
  typeof CreateConstructionFinancePaymentCategoryRequestModel
>;

export const UpdateConstructionFinancePaymentCategoryRequestModel = z.object({
  name,
  expectedUpdatedAt: z.iso
    .datetime()
    .describe(
      "The `updatedAt` you loaded. A mismatch is 409 PAYMENT_CATEGORY_CHANGED.",
    ),
});
export type UpdateConstructionFinancePaymentCategoryRequestModel = z.infer<
  typeof UpdateConstructionFinancePaymentCategoryRequestModel
>;
