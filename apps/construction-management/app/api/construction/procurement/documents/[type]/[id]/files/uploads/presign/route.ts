import { documentFileUploadRoutes } from "../../../../../handlers";

export const dynamic = "force-dynamic";

/**
 * Step 2, deployed: the `handleUploadUrl` that `uploadPresigned()` from
 * `@vercel/blob/client` calls for a presigned URL to one key of this
 * document. 404 where storage is files on disk.
 */
export const POST = documentFileUploadRoutes.presign;
