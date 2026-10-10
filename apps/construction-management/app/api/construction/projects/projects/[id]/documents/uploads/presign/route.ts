import { documentUploadRoutes } from "../../handlers";

export const dynamic = "force-dynamic";

/**
 * Step 2, deployed (CM-414): the `handleUploadUrl` that `uploadPresigned()`
 * from `@vercel/blob/client` calls for a presigned URL to one key of this
 * Project. 404 where storage is files on disk.
 */
export const POST = documentUploadRoutes.presign;
