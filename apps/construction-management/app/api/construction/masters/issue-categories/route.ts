import { issueCategoryRoutes } from "./issue-category-routes";

export const dynamic = "force-dynamic";

/** The Company's Issue Categories by name, with `inUse` and what the caller may do. */
export const GET = issueCategoryRoutes.list;

/** Adds a Issue Category. 409 when a live one has the name (any case). */
export const POST = issueCategoryRoutes.create;
