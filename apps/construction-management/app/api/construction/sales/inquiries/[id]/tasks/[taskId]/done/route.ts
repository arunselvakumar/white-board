import { inquiryTaskRoutes } from "../../task-routes";

export const dynamic = "force-dynamic";

/** Marks an Inquiry Task Done. Needs Inquiry update. */
export const POST = inquiryTaskRoutes.status(true);
