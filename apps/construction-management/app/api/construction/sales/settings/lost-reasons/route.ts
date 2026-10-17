import { lostReasonRoutes } from "../settings-routes";

export const dynamic = "force-dynamic";

/** Adds a Lost Reason. Needs Inquiry update on the Project (CM-1002). */
export const POST = lostReasonRoutes.create;
