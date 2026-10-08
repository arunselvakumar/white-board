import { partyDocumentRoute } from "@/app/api/construction/labour/_party-files/party-file-routes";

import { LABOUR_FILES } from "../../../handlers";

export const dynamic = "force-dynamic";

/** Streams one of the labourer's documents (CM-205). */
export const GET = partyDocumentRoute(LABOUR_FILES);
