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
import { advanceHandlers } from "@/src/composition/contracts-advances";
import {
  menuOfSide,
  type AdvancesAndRetention,
  type ContractInput,
} from "@/src/contracts/application/advance-handlers";
import type { Flag } from "@/src/shared-kernel/access";

import {
  ConstructionContractsAdvanceParamsModel,
  toAdvancesRetentionResponse,
} from "./advance-models";

export { advanceHandlers };

const ContractScope = z.object({
  projectId: z.uuid(),
  workOrderId: z.uuid().nullable().optional(),
});

/**
 * The contract a request is about (the JSON body or query), read before the
 * rest is validated so access is checked first: a Work Order (contractor
 * side, Work Order menu) or the Project's client contract (Client Bills
 * menu).
 */
export function requestContract(raw: unknown): ContractInput {
  return parseOrThrow(ContractScope.safeParse(raw));
}

/**
 * The Session plus `flag` on the side's menu for the Project (CM-1108):
 * 401 / 403 as `requireAccess` (403 `PERMISSION_DENIED` for a Team Member
 * not on the Project). The handlers then answer 404 `PROJECT_NOT_FOUND` or
 * `WORK_ORDER_NOT_FOUND`.
 */
export function requireContractAccess(
  request: Request,
  flag: Flag,
  contract: ContractInput,
): Promise<AccessSession | Response> {
  return requireAccess(
    request,
    menuOfSide(contract.workOrderId == null ? "client" : "contractor"),
    flag,
    { projectId: contract.projectId },
  );
}

/** Answers with the contract's advances and retention as they now are. */
export function respond(view: AdvancesAndRetention, status = 200): Response {
  return Response.json(toAdvancesRetentionResponse(view), { status });
}

type Context = { params: Promise<{ id: string }> };

/**
 * A route about one record (an advance, guarantee or release): found in
 * the caller's Company first (its own 404 for another Company's or a
 * deleted one), then `flag` on its side's menu on its Project, then `act`.
 */
export function recordRoute(
  load: (
    workspaceId: string,
    id: string,
  ) => Promise<{ projectId: string; workOrderId: string | null }>,
  flag: Flag,
  act: (
    session: AccessSession,
    id: string,
    request: Request,
  ) => Promise<AdvancesAndRetention>,
) {
  return async (request: Request, context: Context): Promise<Response> => {
    try {
      const { id } = parseOrThrow(
        ConstructionContractsAdvanceParamsModel.safeParse(await context.params),
      );
      const session = await requireCompanySession(request);
      if (isResponse(session)) return session;
      const target = await load(session.workspaceId, id);
      const access = await requireContractAccess(request, flag, target);
      if (isResponse(access)) return access;
      return respond(await act(access, id, request));
    } catch (error) {
      return mapError(error);
    }
  };
}

/** `expectedUpdatedAt` as a Date, or null when not sent. */
export function expected(raw: string | undefined): Date | null {
  return raw == null ? null : new Date(raw);
}
