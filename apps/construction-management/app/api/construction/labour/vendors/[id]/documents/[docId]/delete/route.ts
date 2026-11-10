import { partyDocumentDeleteRoute } from "@/app/api/construction/labour/_party-files/party-file-routes";

import { VENDOR_FILES } from "../../../../handlers";

export const dynamic = "force-dynamic";

/** Deletes one of the vendor's documents. */
export const POST = partyDocumentDeleteRoute(VENDOR_FILES);
