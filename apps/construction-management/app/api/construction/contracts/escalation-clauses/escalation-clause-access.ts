import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import {
  requireAccess,
  type AccessSession,
} from "@/app/api/_lib/require-access";
import {
  isResponse,
  requireCompanySession,
} from "@/app/api/_lib/require-session";
import { escalationClauseHandlers } from "@/src/composition/contracts-escalation";
import { menuOfSide } from "@/src/contracts/application/advance-handlers";
import type { EscalationClauseView } from "@/src/contracts/application/escalation-clause-handlers";
import type { Flag } from "@/src/shared-kernel/access";

import {
  ConstructionContractsEscalationClauseParamsModel,
  toEscalationClauseResponse,
} from "./escalation-clause-models";

export { escalationClauseHandlers };

/** `flag` on the side's menu: Work Order (contractor) or Client Bills (client contract). */
export function requireClauseContractAccess(
  request: Request,
  flag: Flag,
  contract: { projectId: string; workOrderId?: string | null },
): Promise<AccessSession | Response> {
  return requireAccess(
    request,
    menuOfSide(contract.workOrderId == null ? "client" : "contractor"),
    flag,
    { projectId: contract.projectId },
  );
}

export function respond(view: EscalationClauseView, status = 200): Response {
  return Response.json(toEscalationClauseResponse(view), { status });
}

/**
 * A route about one clause: found in the caller's Company first (404
 * ESCALATION_CLAUSE_NOT_FOUND), then `flag` on its side's menu, then `act`.
 */
export function clauseRoute(
  act: (
    session: AccessSession,
    id: string,
    request: Request,
  ) => Promise<EscalationClauseView>,
) {
  return async (
    request: Request,
    context: { params: Promise<{ id: string }> },
  ): Promise<Response> => {
    try {
      const { id } = parseOrThrow(
        ConstructionContractsEscalationClauseParamsModel.safeParse(
          await context.params,
        ),
      );
      const session = await requireCompanySession(request);
      if (isResponse(session)) return session;
      const clause = await escalationClauseHandlers.find(
        session.workspaceId,
        id,
      );
      const access = await requireClauseContractAccess(
        request,
        "update",
        clause,
      );
      if (isResponse(access)) return access;
      return respond(await act(access, id, request));
    } catch (error) {
      return mapError(error);
    }
  };
}
