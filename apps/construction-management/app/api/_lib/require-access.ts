import { prisma } from "@repo/db";
import { StatusCodes } from "http-status-codes";

import {
  can,
  type Flag,
  type MemberAccess,
  type MenuKey,
} from "@/src/shared-kernel/access";
import { loadMemberAccess } from "@/src/shared-kernel/access/prisma-access-reader";

import { jsonError } from "./json-error";
import {
  isResponse,
  requireCompanySession,
  type CompanySession,
} from "./require-session";

export type AccessSession = CompanySession & { access: MemberAccess };

/**
 * The Session plus a Permission Matrix check (ADR CM-0003): 401 / 403
 * `NO_ACTIVE_COMPANY` as `requireCompanySession`, then 403
 * `PERMISSION_DENIED` unless `can(member, menu, flag, { projectId })`.
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
  return { ...session, access };
}
