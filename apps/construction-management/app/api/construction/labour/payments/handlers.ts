import { prisma } from "@repo/db";
import { StatusCodes } from "http-status-codes";

import { jsonError } from "@/app/api/_lib/json-error";
import type { AccessSession } from "@/app/api/_lib/require-access";
import { requirePlanActive } from "@/app/api/_lib/require-plan-active";
import {
  isResponse,
  requireCompanySession,
} from "@/app/api/_lib/require-session";
import type { PartyType } from "@/src/labour/domain/ledger";
import { createWagePaymentHandlers } from "@/src/labour/infrastructure/wage-payment-factory";
import {
  can,
  type Flag,
  type MemberAccess,
  type MenuKey,
} from "@/src/shared-kernel/access";
import { loadMemberAccess } from "@/src/shared-kernel/access/prisma-access-reader";
import { isWriteFlag } from "@/src/shared-kernel/plan";

/** One set of wage payment handlers for every route (CM-215). */
export const wagePaymentHandlers = createWagePaymentHandlers();

/** Labour payments are under Labour, vendor payments under Vendor (`modules/08`). */
export function paymentMenu(partyType: PartyType): MenuKey {
  return partyType === "labour" ? "labour.labour" : "labour.vendor";
}

/** Amounts need the party's menu Financial on the Project. */
export function paymentFinancial(
  access: MemberAccess,
  partyType: PartyType,
  projectId: string,
): boolean {
  return can(access, paymentMenu(partyType), "financial", { projectId });
}

export function permissionDenied(): Response {
  return jsonError(
    StatusCodes.FORBIDDEN,
    "PERMISSION_DENIED",
    "You do not have permission to do this. Ask the Owner to change your Permission Matrix.",
  );
}

/**
 * The Session plus the Permission Matrix check for a route about one
 * recorded payment: the menu (Labour or Vendor) and the Project come from
 * the payment itself, so it is loaded first (404 for another Company's).
 * Write flags also need an active plan (CM-118).
 */
export async function requirePaymentAccess<
  T extends { partyType: PartyType; projectId: string },
>(
  request: Request,
  flag: Flag,
  load: (workspaceId: string) => Promise<T>,
): Promise<(AccessSession & { target: T }) | Response> {
  const session = await requireCompanySession(request);
  if (isResponse(session)) return session;
  const access = await loadMemberAccess(prisma, session);
  const target = await load(session.workspaceId);
  if (
    !can(access, paymentMenu(target.partyType), flag, {
      projectId: target.projectId,
    })
  )
    return permissionDenied();
  if (isWriteFlag(flag)) {
    const ended = await requirePlanActive(session);
    if (ended != null) return ended;
  }
  return { ...session, access, target };
}
