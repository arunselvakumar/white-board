import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { requireAccess } from "@/app/api/_lib/require-access";
import { isResponse } from "@/app/api/_lib/require-session";

import {
  ConstructionMarketingContactParamsModel,
  UpdateConstructionMarketingContactRequestModel,
  toProspectCompanyResponse,
} from "../../../../company-models";
import {
  COMPANIES_MENU,
  prospectCompanyHandlers as handlers,
} from "../../../../handlers";

export const dynamic = "force-dynamic";

/**
 * Edits a Contact, or makes it the primary one. 404 `CONTACT_NOT_FOUND`,
 * 409 `CONTACT_CHANGED` when stale. Answers the company. Needs Companies
 * update.
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
      UpdateConstructionMarketingContactRequestModel.safeParse(
        await request.json(),
      ),
    );
    await handlers.updateContact(session.access, id, contactId, {
      ...model,
      expectedUpdatedAt: new Date(model.expectedUpdatedAt),
    });
    return Response.json(
      toProspectCompanyResponse(await handlers.get(session.access, id)),
    );
  } catch (error) {
    return mapError(error);
  }
}
