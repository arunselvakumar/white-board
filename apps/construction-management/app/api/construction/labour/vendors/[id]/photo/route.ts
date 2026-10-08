import { partyPhotoRoutes } from "@/app/api/construction/labour/_party-files/party-file-routes";

import { VENDOR_FILES } from "../../handlers";

export const dynamic = "force-dynamic";

/**
 * `GET` streams the vendor's photo; `POST` sets or replaces it: the image
 * itself as the body, PNG, JPEG or WebP, at most 10 MB (CM-208).
 */
export const { GET, POST } = partyPhotoRoutes(VENDOR_FILES);
