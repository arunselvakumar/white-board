import { partyDocumentDeleteRoute } from "@/app/api/construction/labour/_party-files/party-file-routes";

import { EMPLOYEE_FILES } from "../../../../handlers";

export const dynamic = "force-dynamic";

/** Deletes one of the Employee's documents. */
export const POST = partyDocumentDeleteRoute(EMPLOYEE_FILES);
