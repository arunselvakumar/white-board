import { mapError } from "@/app/api/_lib/map-error";
import { requireAccess } from "@/app/api/_lib/require-access";
import { isResponse } from "@/app/api/_lib/require-session";

import { toProspectCompanyFormOptions } from "../company-models";
import {
  COMPANIES_MENU,
  prospectCompanyHandlers as handlers,
} from "../handlers";

export const dynamic = "force-dynamic";

/**
 * Marketing People and the industries already typed, for the company form
 * and the list's filters. Needs Companies read.
 */
export async function GET(request: Request): Promise<Response> {
  try {
    const session = await requireAccess(request, COMPANIES_MENU, "read");
    if (isResponse(session)) return session;
    return Response.json(
      toProspectCompanyFormOptions(await handlers.formOptions(session.access)),
    );
  } catch (error) {
    return mapError(error);
  }
}
