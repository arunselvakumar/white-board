import { documentFileUploadRoutes } from "../../../../../handlers";

export const dynamic = "force-dynamic";

/**
 * Step 2 in development and tests: the raw file as the body, kept at
 * `?key=` on disk. 404 when deployed, where browsers upload straight to
 * Vercel Blob.
 */
export const POST = documentFileUploadRoutes.receive;
