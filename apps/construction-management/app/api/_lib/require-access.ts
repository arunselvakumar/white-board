import { prisma } from "@repo/construction-db";
import { StatusCodes } from "http-status-codes";

import {
  can,
  type Flag,
  type MemberAccess,
  type MenuKey,
} from "@/src/shared-kernel/access";
import { loadMemberAccess } from "@/src/shared-kernel/access/prisma-access-reader";
import { isWriteFlag } from "@/src/shared-kernel/plan";

import { jsonError } from "./json-error";
import { requirePlanActive } from "./require-plan-active";
import {
  isResponse,
  requireCompanySession,
  type CompanySession,
} from "./require-session";

export type AccessSession = CompanySession & { access: MemberAccess };

/**
 * The Session plus a Permission Matrix check (ADR CM-0003): 401 / 403
 * `NO_ACTIVE_COMPANY` as `requireCompanySession`, then 403
 * `PERMISSION_DENIED` unless `can(member, menu, flag, { projectId })`,
 * then 402 `PLAN_EXPIRED` for a write flag (create, update, delete,
 * approve, reject, transfer, import) once the Company's plan has ended
 * (CM-118). Reads and `export` stay open on an ended plan.
 */
export async function requireAccess(
  request: Request,
  menu: MenuKey,
  flag: Flag,
  options: { projectId?: string } = {},
): Promise<AccessSession | Response> {
  const session = await requireCompanySession(request);
  if (isResponse(session)) return session;
  const access = await loadMemberAccess(prisma, session);
  if (!can(access, menu, flag, options))
    return jsonError(
      StatusCodes.FORBIDDEN,
      "PERMISSION_DENIED",
      "You do not have permission to do this. Ask the Owner to change your Permission Matrix.",
    );
  if (isWriteFlag(flag)) {
    const ended = await requirePlanActive(session);
    if (ended != null) return ended;
  }
  return { ...session, access };
}

/**
 * `requireAccess` for an action more than one flag allows, e.g. uploading
 * a file for a new drawing (`create`) or a new revision (`update`): 403
 * `PERMISSION_DENIED` unless the member holds at least one of `flags`.
 * Every flag passed must be a write flag or none, so the plan check stays
 * the same.
 */
export async function requireAnyAccess(
  request: Request,
  menu: MenuKey,
  flags: readonly [Flag, ...Flag[]],
  options: { projectId?: string } = {},
): Promise<AccessSession | Response> {
  const session = await requireCompanySession(request);
  if (isResponse(session)) return session;
  const access = await loadMemberAccess(prisma, session);
  if (!flags.some((flag) => can(access, menu, flag, options)))
    return jsonError(
      StatusCodes.FORBIDDEN,
      "PERMISSION_DENIED",
      "You do not have permission to do this. Ask the Owner to change your Permission Matrix.",
    );
  if (flags.some(isWriteFlag)) {
    const ended = await requirePlanActive(session);
    if (ended != null) return ended;
  }
  return { ...session, access };
}
