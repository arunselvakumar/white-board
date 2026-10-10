import { termsConditionRoutes } from "../../terms-condition-routes";

export const dynamic = "force-dynamic";

/** Changes a Terms & Conditions; carries the `updatedAt` it loaded (409 when stale). */
export const POST = termsConditionRoutes.update;
