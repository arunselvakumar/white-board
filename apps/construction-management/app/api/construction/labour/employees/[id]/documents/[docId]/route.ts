import { partyDocumentRoute } from "@/app/api/construction/labour/_party-files/party-file-routes";

import { EMPLOYEE_FILES } from "../../../handlers";

export const dynamic = "force-dynamic";

/** Streams one of the Employee's documents. */
export const GET = partyDocumentRoute(EMPLOYEE_FILES);
