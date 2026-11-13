import { StatusCodes } from "http-status-codes";

import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { requireAccess } from "@/app/api/_lib/require-access";
import { isResponse } from "@/app/api/_lib/require-session";

import {
  ConstructionMarketingProspectCompanyParamsModel,
  CreateConstructionMarketingContactRequestModel,
  toProspectCompanyResponse,
} from "../../company-models";
import {
  COMPANIES_MENU,
  prospectCompanyHandlers as handlers,
} from "../../handlers";

export const dynamic = "force-dynamic";

/**
 * Adds a Contact to a Prospect Company; the first one, or one marked
 * primary, becomes the primary Contact. Answers the company. Needs
 * Companies update.
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
    const session = await requireAccess(request, COMPANIES_MENU, "update");
    if (isResponse(session)) return session;
    const model = parseOrThrow(
      CreateConstructionMarketingContactRequestModel.safeParse(
        await request.json(),
      ),
    );
    await handlers.addContact(session.access, id, model);
    return Response.json(
      toProspectCompanyResponse(await handlers.get(session.access, id)),
      { status: StatusCodes.CREATED },
    );
  } catch (error) {
    return mapError(error);
  }
}
