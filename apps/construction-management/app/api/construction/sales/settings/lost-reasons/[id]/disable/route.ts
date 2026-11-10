import { salesPickToggleRoute } from "../../../settings-routes";

export const dynamic = "force-dynamic";

/** Takes it out of the inquiry pickers; old inquiries keep it. Needs Inquiry update. */
export const POST = salesPickToggleRoute("lost_reason", false);
