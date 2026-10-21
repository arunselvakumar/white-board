import { variationHandlers } from "../../boq-access";
import { variationRoute } from "../variation-route";

export const dynamic = "force-dynamic";

/** One Variation (CM-1103). Needs BOQ read; rates need Financial. */
export const GET = variationRoute("read", async (session, id) => {
  const found = await variationHandlers.get(session.access, id);
  return found.variation;
});
