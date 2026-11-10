import { salesPickToggleRoute } from "../../../settings-routes";

export const dynamic = "force-dynamic";

/** Puts it back in the inquiry pickers. Needs Inquiry update. */
export const POST = salesPickToggleRoute("lead_source", true);
