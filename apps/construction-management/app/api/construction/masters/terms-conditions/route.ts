import { termsConditionRoutes } from "./terms-condition-routes";

export const dynamic = "force-dynamic";

/** Terms & Conditions of the Active Company, newest first in cursor pages; `?status=enabled` for pickers. */
export const GET = termsConditionRoutes.list;

/** Adds a Terms & Conditions. 409 when a live one has the name. */
export const POST = termsConditionRoutes.create;
