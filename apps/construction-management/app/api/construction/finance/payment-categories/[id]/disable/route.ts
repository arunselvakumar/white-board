import { paymentCategoryRoutes } from "../../payment-category-routes";

export const dynamic = "force-dynamic";

/** Takes a Payment Category off the pickers; old documents keep it. */
export const POST = paymentCategoryRoutes.disable;
