import { partyDocumentDeleteRoute } from "@/app/api/construction/labour/_party-files/party-file-routes";

import { LABOUR_FILES } from "../../../../handlers";

export const dynamic = "force-dynamic";

/** Deletes one of the labourer's documents (CM-205). */
export const POST = partyDocumentDeleteRoute(LABOUR_FILES);
