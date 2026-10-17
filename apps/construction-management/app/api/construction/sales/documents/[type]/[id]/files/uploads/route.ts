import { salesFileUploadRoutes } from "../../../../handlers";

export const dynamic = "force-dynamic";

/**
 * Starts a file upload on an inquiry or booking (step 1) for a role:
 * checks the role, name, size, count and plan, and says where the bytes go.
 */
export const POST = salesFileUploadRoutes.start;
