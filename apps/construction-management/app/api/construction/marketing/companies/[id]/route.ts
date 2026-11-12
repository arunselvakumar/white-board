import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { requireAccess } from "@/app/api/_lib/require-access";
import { isResponse } from "@/app/api/_lib/require-session";

import {
  ConstructionMarketingProspectCompanyParamsModel,
  toProspectCompanyResponse,
} from "../company-models";
import {
  COMPANIES_MENU,
  prospectCompanyHandlers as handlers,
} from "../handlers";

export const dynamic = "force-dynamic";

/**
 * A Prospect Company with its Contacts and its timeline, newest first.
 * 404 `PROSPECT_COMPANY_NOT_FOUND` for another Company's, a deleted one,
 * or one the caller may not see. Needs Companies read.
 */
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const session = await requireAccess(request, COMPANIES_MENU, "read");
    if (isResponse(session)) return session;
    const { id } = parseOrThrow(
      ConstructionMarketingProspectCompanyParamsModel.safeParse(
        await context.params,
      ),
    );
    return Response.json(
      toProspectCompanyResponse(await handlers.get(session.access, id)),
    );
  } catch (error) {
    return mapError(error);
  }
}
