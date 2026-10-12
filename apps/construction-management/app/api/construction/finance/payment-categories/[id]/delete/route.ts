import { paymentCategoryRoutes } from "../../payment-category-routes";

export const dynamic = "force-dynamic";

/**
 * Deletes an unused Payment Category (a tombstone). 409
 * PAYMENT_CATEGORY_IN_USE when anything names it, PAYMENT_CATEGORY_SEED for
 * a seed: disable those instead.
 */
export const POST = paymentCategoryRoutes.delete;
