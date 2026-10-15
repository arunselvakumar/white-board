import { trackingFileUploadRoutes } from "../../../../handlers";

export const dynamic = "force-dynamic";

/**
 * Starts a file upload on a tracking document (step 1): checks the name
 * against the document's policy, the size, count and plan, and says where
 * the bytes go — straight to Vercel Blob, or through `uploads/app` where
 * storage is files on disk.
 */
export const POST = trackingFileUploadRoutes.start;
