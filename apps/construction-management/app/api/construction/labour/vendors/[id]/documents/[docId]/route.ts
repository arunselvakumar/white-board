import { partyDocumentRoute } from "@/app/api/construction/labour/_party-files/party-file-routes";

import { VENDOR_FILES } from "../../../handlers";

export const dynamic = "force-dynamic";

/** Streams one of the vendor's documents. */
export const GET = partyDocumentRoute(VENDOR_FILES);
