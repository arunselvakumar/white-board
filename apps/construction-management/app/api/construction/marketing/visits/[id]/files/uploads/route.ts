import { visitFileUploadRoutes } from "../../../file-routes";

export const dynamic = "force-dynamic";

/** Starts an upload to a Visit; 409 `VISIT_FILE_LIMIT` with 20 live. */
export const POST = visitFileUploadRoutes.start;
