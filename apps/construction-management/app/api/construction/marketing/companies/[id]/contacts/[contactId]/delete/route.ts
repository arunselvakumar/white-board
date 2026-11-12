import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { requireAccess } from "@/app/api/_lib/require-access";
import { isResponse } from "@/app/api/_lib/require-session";

import {
  ConstructionMarketingContactParamsModel,
  DeleteConstructionMarketingContactRequestModel,
  toProspectCompanyResponse,
} from "../../../../company-models";
import {
  COMPANIES_MENU,
  prospectCompanyHandlers as handlers,
} from "../../../../handlers";

export const dynamic = "force-dynamic";

/**
 * Removes a Contact (a tombstone); when it was primary, the oldest other
 * Contact becomes primary. Answers the company. Needs Companies update.
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string; contactId: string }> },
): Promise<Response> {
  try {
    const { id, contactId } = parseOrThrow(
      ConstructionMarketingContactParamsModel.safeParse(await context.params),
    );
    const session = await requireAccess(request, COMPANIES_MENU, "update");
    if (isResponse(session)) return session;
    const model = parseOrThrow(
      DeleteConstructionMarketingContactRequestModel.safeParse(
        await request.json(),
      ),
    );
    await handlers.deleteContact(
      session.access,
      id,
      contactId,
      new Date(model.expectedUpdatedAt),
    );
    return Response.json(
      toProspectCompanyResponse(await handlers.get(session.access, id)),
    );
  } catch (error) {
    return mapError(error);
  }
}
