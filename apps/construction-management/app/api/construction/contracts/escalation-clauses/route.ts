import { StatusCodes } from "http-status-codes";
import { z } from "zod";

import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { isResponse } from "@/app/api/_lib/require-session";

import {
  escalationClauseHandlers,
  requireClauseContractAccess,
  respond,
} from "./escalation-clause-access";
import { CreateConstructionContractsEscalationClauseRequestModel } from "./escalation-clause-models";

export const dynamic = "force-dynamic";

const Scope = z.object({
  projectId: z.uuid(),
  workOrderId: z.uuid().nullable().optional(),
});

/**
 * Adds the escalation clause of a Work Order (`workOrderId`) or of the
 * Project's client contract (CM-1109): base month, non-escalable % and
 * components whose weights sum to 100. 409 ESCALATION_CLAUSE_EXISTS.
 * Needs Update and Financial on Work Orders (contractor side) or Client
 * Bills (client side).
 */
export async function POST(request: Request): Promise<Response> {
  try {
    const body: unknown = await request.json();
    const scope = parseOrThrow(Scope.safeParse(body));
    const session = await requireClauseContractAccess(request, "update", scope);
    if (isResponse(session)) return session;
    const model = parseOrThrow(
      CreateConstructionContractsEscalationClauseRequestModel.safeParse(body),
    );
    return respond(
      await escalationClauseHandlers.create(session.access, model),
      StatusCodes.CREATED,
    );
  } catch (error) {
    return mapError(error);
  }
}
