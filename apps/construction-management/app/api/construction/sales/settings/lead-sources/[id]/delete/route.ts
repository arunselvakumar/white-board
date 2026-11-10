import { leadSourceRoutes } from "../../../settings-routes";

export const dynamic = "force-dynamic";

/** Deletes it unless inquiries use it. Needs Inquiry update. */
export const POST = leadSourceRoutes.remove;
