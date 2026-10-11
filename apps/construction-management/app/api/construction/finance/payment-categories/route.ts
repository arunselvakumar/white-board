import { paymentCategoryRoutes } from "./payment-category-routes";

export const dynamic = "force-dynamic";

/**
 * Every live Payment Category of the Active Company by name, with its Seed,
 * Disabled and in-use flags; `?status=enabled` or `disabled` narrows it.
 */
export const GET = paymentCategoryRoutes.list;

/** Adds a Payment Category. 409 when a live one has the name. */
export const POST = paymentCategoryRoutes.create;
