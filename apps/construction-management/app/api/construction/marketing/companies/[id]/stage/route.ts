import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { requireAccess } from "@/app/api/_lib/require-access";
import { isResponse } from "@/app/api/_lib/require-session";

import {
  ConstructionMarketingProspectCompanyParamsModel,
  MoveConstructionMarketingProspectCompanyStageRequestModel,
  toProspectCompanyResponse,
} from "../../company-models";
import {
  COMPANIES_MENU,
  prospectCompanyHandlers as handlers,
} from "../../handlers";

export const dynamic = "force-dynamic";

/**
 * Moves a Prospect Company to a Stage by hand, kept in its history (ADR
 * CM-0040 §11). Lost needs a Lost Reason; leaving Lost clears it. Needs
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
      MoveConstructionMarketingProspectCompanyStageRequestModel.safeParse(
        await request.json(),
      ),
    );
    await handlers.moveStage(session.access, id, {
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
