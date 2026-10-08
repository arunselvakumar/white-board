import { partyDocumentsRoutes } from "@/app/api/construction/labour/_party-files/party-file-routes";

import { LABOUR_FILES } from "../../handlers";

export const dynamic = "force-dynamic";

/**
 * `GET` lists the labourer's "Other Documents"; `POST` adds one: the file
 * as the body (PDF, PNG, JPEG or WebP, ≤ 10 MB) and `?fileName=` (CM-205).
 */
export const { GET, POST } = partyDocumentsRoutes(LABOUR_FILES);
