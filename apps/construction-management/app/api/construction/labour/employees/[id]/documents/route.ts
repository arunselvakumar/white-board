import { partyDocumentsRoutes } from "@/app/api/construction/labour/_party-files/party-file-routes";

import { EMPLOYEE_FILES } from "../../handlers";

export const dynamic = "force-dynamic";

/**
 * `GET` lists the Employee's "Other Documents"; `POST` adds one: the file
 * as the body (PDF, PNG, JPEG or WebP, ≤ 10 MB) and `?fileName=`.
 */
export const { GET, POST } = partyDocumentsRoutes(EMPLOYEE_FILES);
