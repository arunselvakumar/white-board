import { partyPhotoRemoveRoute } from "@/app/api/construction/labour/_party-files/party-file-routes";

import { LABOUR_FILES } from "../../../handlers";

export const dynamic = "force-dynamic";

/** Removes the labourer's photo (CM-205). */
export const POST = partyPhotoRemoveRoute(LABOUR_FILES);
