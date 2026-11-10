import { inquiryTaskRoutes } from "../../task-routes";

export const dynamic = "force-dynamic";

/** Deletes an Inquiry Task. Needs Inquiry update. */
export const POST = inquiryTaskRoutes.remove;
