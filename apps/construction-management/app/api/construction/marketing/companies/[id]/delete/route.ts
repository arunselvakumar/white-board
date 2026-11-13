import { StatusCodes } from "http-status-codes";

import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { requireAccess } from "@/app/api/_lib/require-access";
import { isResponse } from "@/app/api/_lib/require-session";

import {
  ConstructionMarketingProspectCompanyParamsModel,
  DeleteConstructionMarketingProspectCompanyRequestModel,
} from "../../company-models";
import {
  COMPANIES_MENU,
  prospectCompanyHandlers as handlers,
} from "../../handlers";

export const dynamic = "force-dynamic";

/**
 * Deletes a Prospect Company with its Contacts and Follow-ups (a
 * tombstone). 409 `PROSPECT_COMPANY_CHANGED` when stale. Needs Companies
 * delete.
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const { id } = parseOrThrow(
      ConstructionMarketingProspectCompanyParamsModel.safeParse(
        await context.params,
      ),
    );
    const session = await requireAccess(request, COMPANIES_MENU, "delete");
    if (isResponse(session)) return session;
    const model = parseOrThrow(
      DeleteConstructionMarketingProspectCompanyRequestModel.safeParse(
        await request.json(),
      ),
    );
    await handlers.delete(
      session.access,
      id,
      new Date(model.expectedUpdatedAt),
    );
    return new Response(null, { status: StatusCodes.NO_CONTENT });
  } catch (error) {
    return mapError(error);
  }
}
