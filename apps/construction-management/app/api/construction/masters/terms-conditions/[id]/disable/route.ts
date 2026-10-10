import { termsConditionRoutes } from "../../terms-condition-routes";

export const dynamic = "force-dynamic";

/** Takes a Terms & Conditions off the pickers; what already uses it keeps it. */
export const POST = termsConditionRoutes.disable;
