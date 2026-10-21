import { salesFileUploadRoutes } from "../../../../../handlers";

export const dynamic = "force-dynamic";

/** Step 2 in development and tests: the raw file, kept at `?key=`. */
export const POST = salesFileUploadRoutes.receive;
