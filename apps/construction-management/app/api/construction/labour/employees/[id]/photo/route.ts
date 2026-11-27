import { partyPhotoRoutes } from "@/app/api/construction/labour/_party-files/party-file-routes";

import { EMPLOYEE_FILES } from "../../handlers";

export const dynamic = "force-dynamic";

/**
 * `GET` streams the Employee's photo; `POST` sets or replaces it: the
 * image itself as the body, PNG, JPEG or WebP, at most 10 MB.
 */
export const { GET, POST } = partyPhotoRoutes(EMPLOYEE_FILES);
