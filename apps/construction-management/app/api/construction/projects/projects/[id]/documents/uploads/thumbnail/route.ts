import { documentUploadRoutes } from "../../handlers";

export const dynamic = "force-dynamic";

/**
 * An image's browser-made WebP thumbnail (CM-407): sent after the file and
 * before finishing the upload, which records it.
 */
export const POST = documentUploadRoutes.thumbnail;
