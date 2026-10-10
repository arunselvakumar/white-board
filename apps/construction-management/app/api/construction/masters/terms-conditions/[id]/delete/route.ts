import { termsConditionRoutes } from "../../terms-condition-routes";

export const dynamic = "force-dynamic";

/** Deletes a Terms & Conditions (a tombstone); 409 while something uses it. */
export const POST = termsConditionRoutes.delete;
