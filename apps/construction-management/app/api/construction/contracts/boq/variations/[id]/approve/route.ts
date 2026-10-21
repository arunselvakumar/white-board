import { variationHandlers } from "../../../boq-access";
import { variationRoute } from "../../variation-route";

export const dynamic = "force-dynamic";

/**
 * Approves a pending Variation and applies it in the same transaction
 * (CM-1103): an extra item becomes a BOQ item; a quantity or rate change
 * sets the item's current figure. 409 VARIATION_NOT_PENDING. Needs BOQ
 * approve.
 */
export const POST = variationRoute("approve", (session, id) =>
  variationHandlers.approve(session.access, id),
);
