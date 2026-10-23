import { parseOrThrow } from "@/app/api/_lib/map-error";

import {
  clauseRoute,
  escalationClauseHandlers,
} from "../../escalation-clause-access";
import { UpdateConstructionContractsEscalationClauseRequestModel } from "../../escalation-clause-models";

export const dynamic = "force-dynamic";

/**
 * Replaces the clause's terms (CM-1109) while no approved escalation bill
 * uses it (409 ESCALATION_CLAUSE_USED); 409 ESCALATION_CLAUSE_CHANGED when
 * stale. Needs Update and Financial on the side's menu.
 */
export const POST = clauseRoute(async (session, id, request) => {
  const model = parseOrThrow(
    UpdateConstructionContractsEscalationClauseRequestModel.safeParse(
      await request.json(),
    ),
  );
  return escalationClauseHandlers.update(session.access, id, {
    ...model,
    expectedUpdatedAt: new Date(model.expectedUpdatedAt),
  });
});
