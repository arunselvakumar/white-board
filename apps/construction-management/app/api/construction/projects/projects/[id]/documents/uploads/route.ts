import { documentUploadRoutes } from "../handlers";

export const dynamic = "force-dynamic";

/**
 * Starts an upload (step 1, CM-414): checks the name, size, count and
 * plan, and says where the bytes go — straight to Vercel Blob, or through
 * `uploads/app` where storage is files on disk.
 */
export const POST = documentUploadRoutes.start;
