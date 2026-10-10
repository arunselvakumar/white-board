import { mapError } from "@/app/api/_lib/map-error";
import { requireAccess } from "@/app/api/_lib/require-access";
import { isResponse } from "@/app/api/_lib/require-session";

import {
  toFenceResponse,
  type ListConstructionHrmsMyFencesResponseModel,
} from "../branch-models";
import { branches } from "../handlers";

export const dynamic = "force-dynamic";

/**
 * The fences the signed-in member may check in at (CM-304, ADR CM-0012
 * §4). Needs `hrms.attendance` read, as check-in does.
 */
export async function GET(request: Request): Promise<Response> {
  try {
    const session = await requireAccess(request, "hrms.attendance", "read");
    if (isResponse(session)) return session;
    const mine = await branches.myFences({ access: session.access });
    const body: ListConstructionHrmsMyFencesResponseModel = {
      memberId: mine.memberId,
      items: mine.fences.map(toFenceResponse),
    };
    return Response.json(body);
  } catch (error) {
    return mapError(error);
  }
}
