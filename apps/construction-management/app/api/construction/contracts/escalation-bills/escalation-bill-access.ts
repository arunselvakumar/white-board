import { z } from "zod";

import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import {
  requireAccess,
  type AccessSession,
} from "@/app/api/_lib/require-access";
import {
  isResponse,
  requireCompanySession,
} from "@/app/api/_lib/require-session";
import { escalationBillHandlers } from "@/src/composition/contracts-escalation";
import { CLIENT_BILL_MENU } from "@/src/contracts/application/client-bill-ports";
import { CONTRACTOR_BILL_MENU } from "@/src/contracts/application/contractor-bill-ports";
import type { StoredEscalationBill } from "@/src/contracts/application/escalation-ports";
import type { Flag } from "@/src/shared-kernel/access";

import {
  ConstructionContractsEscalationBillParamsModel,
  toEscalationBillResponse,
} from "./escalation-bill-models";

export { escalationBillHandlers };

export const menuOfBillSide = (side: "contractor" | "client") =>
  side === "contractor" ? CONTRACTOR_BILL_MENU : CLIENT_BILL_MENU;

const Scope = z.object({
  projectId: z.uuid(),
  workOrderId: z.uuid().nullable().optional(),
});

/** The contract a request names (the body or query), read before the rest. */
export function requestContract(raw: unknown): {
  projectId: string;
  workOrderId: string | null;
} {
  const scope = parseOrThrow(Scope.safeParse(raw));
  return { projectId: scope.projectId, workOrderId: scope.workOrderId ?? null };
}

/**
 * `flag` on the side's bill menu for the Project: Contractor Bills for a
 * Work Order, Client Bills for the client contract (403
 * PERMISSION_DENIED for a Team Member not on the Project). The handlers
 * then answer 404 PROJECT_NOT_FOUND.
 */
export function requireEscalationContractAccess(
  request: Request,
  flag: Flag,
  side: "contractor" | "client",
  projectId: string,
): Promise<AccessSession | Response> {
  return requireAccess(request, menuOfBillSide(side), flag, { projectId });
}

/**
 * A route about one escalation bill: found in the caller's Company first
 * (404 BILL_NOT_FOUND), then `flags` (any one) on its side's menu, then
 * `act`; answers with the bill as it now is.
 */
export function escalationBillRoute(
  flags: Flag | readonly [Flag, ...Flag[]],
  act: (
    session: AccessSession & { target: StoredEscalationBill },
    id: string,
    request: Request,
  ) => Promise<unknown>,
) {
  return async (
    request: Request,
    context: { params: Promise<{ id: string }> },
  ): Promise<Response> => {
    try {
      const { id } = parseOrThrow(
        ConstructionContractsEscalationBillParamsModel.safeParse(
          await context.params,
        ),
      );
      const session = await requireEscalationBillAccess(request, flags, id);
      if (isResponse(session)) return session;
      await act(session, id, request);
      const detail = await escalationBillHandlers.get(session.access, id);
      return Response.json(toEscalationBillResponse(detail));
    } catch (error) {
      return mapError(error);
    }
  };
}

export async function requireEscalationBillAccess(
  request: Request,
  flags: Flag | readonly [Flag, ...Flag[]],
  id: string,
): Promise<(AccessSession & { target: StoredEscalationBill }) | Response> {
  const session = await requireCompanySession(request);
  if (isResponse(session)) return session;
  const target = await escalationBillHandlers.find(session.workspaceId, id);
  const list: readonly Flag[] = typeof flags === "string" ? [flags] : flags;
  let last: Response | null = null;
  for (const flag of list) {
    const access = await requireAccess(
      request,
      menuOfBillSide(target.side),
      flag,
      { projectId: target.projectId },
    );
    if (!isResponse(access)) return { ...access, target };
    last = access;
  }
  return last ?? new Response(null, { status: 403 });
}

/** `expectedUpdatedAt` as a Date, or null when not sent. */
export function expected(raw: string | null | undefined): Date | null {
  return raw == null ? null : new Date(raw);
}
