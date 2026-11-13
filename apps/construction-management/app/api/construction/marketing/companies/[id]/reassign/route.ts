import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { requireAccess } from "@/app/api/_lib/require-access";
import { isResponse } from "@/app/api/_lib/require-session";

import {
  ConstructionMarketingProspectCompanyParamsModel,
  ReassignConstructionMarketingProspectCompanyRequestModel,
  toProspectCompanyResponse,
} from "../../company-models";
import {
  COMPANIES_MENU,
  prospectCompanyHandlers as handlers,
} from "../../handlers";

export const dynamic = "force-dynamic";

/**
 * Reassigns a Prospect Company, with every open Follow-up of it, to another
 * active Marketing Person; past Visits keep their visitors. Needs
 * Companies transfer.
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
    const session = await requireAccess(request, COMPANIES_MENU, "transfer");
    if (isResponse(session)) return session;
    const model = parseOrThrow(
      ReassignConstructionMarketingProspectCompanyRequestModel.safeParse(
        await request.json(),
      ),
    );
    await handlers.reassign(session.access, id, {
      assignedMemberId: model.assignedMemberId,
      expectedUpdatedAt: new Date(model.expectedUpdatedAt),
    });
    return Response.json(
      toProspectCompanyResponse(await handlers.get(session.access, id)),
    );
  } catch (error) {
    return mapError(error);
  }
}
