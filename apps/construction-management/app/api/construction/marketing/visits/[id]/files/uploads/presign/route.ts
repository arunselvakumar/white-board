import { visitFileUploadRoutes } from "../../../../file-routes";

export const dynamic = "force-dynamic";

/** The browser's direct-upload handshake, deployed. */
export const POST = visitFileUploadRoutes.presign;
