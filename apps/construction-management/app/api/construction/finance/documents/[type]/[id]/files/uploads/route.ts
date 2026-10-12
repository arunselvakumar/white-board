import { documentFileUploadRoutes } from "../../../../handlers";

export const dynamic = "force-dynamic";

/**
 * Starts a file upload on a finance document (step 1): Create or Update
 * on its menu; checks the name against the document's policy, the size,
 * count and plan, and says where the bytes go — straight to Vercel Blob,
 * or through `uploads/app` where storage is files on disk.
 */
export const POST = documentFileUploadRoutes.start;
