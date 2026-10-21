import { inquiryTaskRoutes } from "../../task-routes";

export const dynamic = "force-dynamic";

/** Deletes an Inquiry Task (CM-1004). Needs Inquiry update. */
export const POST = inquiryTaskRoutes.remove;
