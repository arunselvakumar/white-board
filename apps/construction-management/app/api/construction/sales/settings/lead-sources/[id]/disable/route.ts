import { salesPickToggleRoute } from "../../../settings-routes";

export const dynamic = "force-dynamic";

/** Takes it out of the inquiry pickers; old inquiries keep it. Needs Inquiry update (CM-1002). */
export const POST = salesPickToggleRoute("lead_source", false);
