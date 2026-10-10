import { prisma } from "@repo/construction-db";
import { StatusCodes } from "http-status-codes";

import { jsonError } from "@/app/api/_lib/json-error";
import type { AccessSession } from "@/app/api/_lib/require-access";
import {
  isResponse,
  requireCompanySession,
} from "@/app/api/_lib/require-session";
import { can } from "@/src/shared-kernel/access";
import { loadMemberAccess } from "@/src/shared-kernel/access/prisma-access-reader";

/**
 * The Session plus `approve` or `reject` on `hrms.attendance` (reading the
 * Attendance Approvals list needs either); 403 `PERMISSION_DENIED` otherwise.
 */
export async function requireApprover(
  request: Request,
): Promise<AccessSession | Response> {
  const session = await requireCompanySession(request);
  if (isResponse(session)) return session;
  const access = await loadMemberAccess(prisma, session);
  if (
    !can(access, "hrms.attendance", "approve") &&
    !can(access, "hrms.attendance", "reject")
  )
    return jsonError(
      StatusCodes.FORBIDDEN,
      "PERMISSION_DENIED",
      "You do not have permission to do this. Ask the Owner to change your Permission Matrix.",
    );
  return { ...session, access };
}
