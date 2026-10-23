import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { isResponse } from "@/app/api/_lib/require-session";

import {
  escalationBillHandlers,
  requireEscalationContractAccess,
} from "../escalation-bill-access";
import {
  ConstructionContractsEscalationFormOptionsRequestModel,
  toEscalationFormOptionsResponse,
} from "../escalation-bill-models";

export const dynamic = "force-dynamic";

/**
 * What "New escalation bill" offers (CM-1109): the Project's issued or
 * closed Work Orders with their clause's base month (contractor side), or
 * the client contract's clause. Needs the side's bill Create.
 */
export async function GET(request: Request): Promise<Response> {
  try {
    const model = parseOrThrow(
      ConstructionContractsEscalationFormOptionsRequestModel.safeParse(
        Object.fromEntries(new URL(request.url).searchParams),
      ),
    );
    const session = await requireEscalationContractAccess(
      request,
      "create",
      model.side,
      model.projectId,
    );
    if (isResponse(session)) return session;
    return Response.json(
      toEscalationFormOptionsResponse(
        await escalationBillHandlers.formOptions(
          session.access,
          model.projectId,
          model.side,
        ),
      ),
    );
  } catch (error) {
    return mapError(error);
  }
}
