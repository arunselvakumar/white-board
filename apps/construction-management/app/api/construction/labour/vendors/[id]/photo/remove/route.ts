import { partyPhotoRemoveRoute } from "@/app/api/construction/labour/_party-files/party-file-routes";

import { VENDOR_FILES } from "../../../handlers";

export const dynamic = "force-dynamic";

/** Removes the vendor's photo (CM-208). */
export const POST = partyPhotoRemoveRoute(VENDOR_FILES);
