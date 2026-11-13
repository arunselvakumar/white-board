import { visitFileUploadRoutes } from "../../../../file-routes";

export const dynamic = "force-dynamic";

/** The file's bytes through the app, where storage is files on disk. */
export const POST = visitFileUploadRoutes.receive;
