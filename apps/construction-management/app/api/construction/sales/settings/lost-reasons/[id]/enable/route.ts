import { salesPickToggleRoute } from "../../../settings-routes";

export const dynamic = "force-dynamic";

/** Puts it back in the inquiry pickers. Needs Inquiry update (CM-1002). */
export const POST = salesPickToggleRoute("lost_reason", true);
