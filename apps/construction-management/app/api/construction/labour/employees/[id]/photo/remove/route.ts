import { partyPhotoRemoveRoute } from "@/app/api/construction/labour/_party-files/party-file-routes";

import { EMPLOYEE_FILES } from "../../../handlers";

export const dynamic = "force-dynamic";

/** Removes the Employee's photo. */
export const POST = partyPhotoRemoveRoute(EMPLOYEE_FILES);
