import { issueCategoryRoutes } from "../../issue-category-routes";

export const dynamic = "force-dynamic";

/** Deletes a Issue Category (a tombstone); 409 while a live tracking record uses it. */
export const POST = issueCategoryRoutes.delete;
