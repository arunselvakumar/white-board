import { inquiryTaskRoutes } from "../../task-routes";

export const dynamic = "force-dynamic";

/** Puts a done Inquiry Task back to Open. Needs Inquiry update. */
export const POST = inquiryTaskRoutes.status(false);
