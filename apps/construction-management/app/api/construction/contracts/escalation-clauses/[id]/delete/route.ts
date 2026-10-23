import { parseOrThrow } from "@/app/api/_lib/map-error";

import {
  clauseRoute,
  escalationClauseHandlers,
} from "../../escalation-clause-access";
import { DeleteConstructionContractsEscalationClauseRequestModel } from "../../escalation-clause-models";

export const dynamic = "force-dynamic";

/**
 * Removes the clause (CM-1109) while no approved escalation bill uses it
 * (409 ESCALATION_CLAUSE_USED). Needs Update and Financial on the side's
 * menu. Answers the contract's (now empty) clause view.
 */
export const POST = clauseRoute(async (session, id, request) => {
  const model = parseOrThrow(
    DeleteConstructionContractsEscalationClauseRequestModel.safeParse(
      await request.json(),
    ),
  );
  return escalationClauseHandlers.delete(
    session.access,
    id,
    model.expectedUpdatedAt == null ? null : new Date(model.expectedUpdatedAt),
  );
});
