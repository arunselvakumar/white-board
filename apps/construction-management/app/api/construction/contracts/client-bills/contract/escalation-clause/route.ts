import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { isResponse } from "@/app/api/_lib/require-session";

import {
  escalationClauseHandlers,
  requireClauseContractAccess,
  respond,
} from "../../../escalation-clauses/escalation-clause-access";
import { ConstructionContractsEscalationClauseQueryModel } from "../../../escalation-clauses/escalation-clause-models";

export const dynamic = "force-dynamic";

/**
 * The client contract's escalation clause, or none (CM-1109). Needs
 * Client Bills read; weights and money are null without Financial.
 */
export async function GET(request: Request): Promise<Response> {
  try {
    const { projectId } = parseOrThrow(
      ConstructionContractsEscalationClauseQueryModel.safeParse(
        Object.fromEntries(new URL(request.url).searchParams),
      ),
    );
    const session = await requireClauseContractAccess(request, "read", {
      projectId,
    });
    if (isResponse(session)) return session;
    return respond(
      await escalationClauseHandlers.get(session.access, { projectId }),
    );
  } catch (error) {
    return mapError(error);
  }
}
