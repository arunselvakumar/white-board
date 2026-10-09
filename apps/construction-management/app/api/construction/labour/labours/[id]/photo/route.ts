import { partyPhotoRoutes } from "@/app/api/construction/labour/_party-files/party-file-routes";

import { LABOUR_FILES } from "../../handlers";

export const dynamic = "force-dynamic";

/**
 * `GET` streams the labourer's photo; `POST` sets or replaces it: the
 * image itself as the body, PNG, JPEG or WebP, at most 10 MB (CM-205).
 */
export const { GET, POST } = partyPhotoRoutes(LABOUR_FILES);
