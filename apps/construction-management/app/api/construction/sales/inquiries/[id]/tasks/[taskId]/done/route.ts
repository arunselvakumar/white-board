import { inquiryTaskRoutes } from "../../task-routes";

export const dynamic = "force-dynamic";

/** Marks an Inquiry Task Done (CM-1004). Needs Inquiry update. */
export const POST = inquiryTaskRoutes.status(true);
