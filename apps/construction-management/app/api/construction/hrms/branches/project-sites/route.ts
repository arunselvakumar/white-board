import { mapError } from "@/app/api/_lib/map-error";
import { requireAccess } from "@/app/api/_lib/require-access";
import { isResponse } from "@/app/api/_lib/require-session";

import {
  toProjectSiteResponse,
  type ListConstructionHrmsProjectSitesResponseModel,
} from "../branch-models";
import { branches } from "../handlers";

export const dynamic = "force-dynamic";

/** Every live Project with its site fence, or null (CM-304). */
export async function GET(request: Request): Promise<Response> {
  try {
    const session = await requireAccess(request, "hrms.settings", "read");
    if (isResponse(session)) return session;
    const sites = await branches.projectSites({ access: session.access });
    const body: ListConstructionHrmsProjectSitesResponseModel = {
      items: sites.map(toProjectSiteResponse),
    };
    return Response.json(body);
  } catch (error) {
    return mapError(error);
  }
}
