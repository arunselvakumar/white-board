import { paymentCategoryRoutes } from "../../payment-category-routes";

export const dynamic = "force-dynamic";

/** Renames a Payment Category (a seed too) with the `updatedAt` you loaded. */
export const POST = paymentCategoryRoutes.update;
