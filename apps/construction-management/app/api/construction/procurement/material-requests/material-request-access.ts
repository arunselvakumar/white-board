import { prisma } from "@repo/construction-db";

import {
  isResponse,
  requireCompanySession,
  type CompanySession,
} from "@/app/api/_lib/require-session";
import type { MaterialRequestReadModel } from "@/src/procurement/application/material-request-handlers";
import { materialRequestNotFound } from "@/src/procurement/infrastructure/material-request-repository";
import type { Flag, MemberAccess } from "@/src/shared-kernel/access";
import { loadMemberAccess } from "@/src/shared-kernel/access/prisma-access-reader";

import {
  canOnProject,
  canOnRequest,
  permissionDenied,
  planGate,
} from "../stores/central-store-access";
import { centralStore } from "../stores/central-store-wiring";

export type RequestSession = CompanySession & {
  access: MemberAccess;
  request: MaterialRequestReadModel;
};

/**
 * The Session plus a check on one live Material Request (404 for another
 * Company's or a deleted one). `side: "project"` needs the flag and the
 * Project (raise, edit, delete); `side: "any"` the flag and either the
 * Project or Central Store read (read, close, PDF).
 */
export async function requireRequestAccess(
  request: Request,
  id: string,
  flag: Flag,
  side: "project" | "any",
): Promise<RequestSession | Response> {
  const session = await requireCompanySession(request);
  if (isResponse(session)) return session;
  const access = await loadMemberAccess(prisma, session);
  const found = await centralStore.materialRequests.get(session.workspaceId, id);
  if (found == null) throw materialRequestNotFound();
  const allowed =
    side === "project"
      ? canOnProject(access, flag, found.projectId)
      : canOnRequest(access, flag, found);
  if (!allowed) return permissionDenied();
  const ended = await planGate(session, [flag]);
  if (ended != null) return ended;
  return { ...session, access, request: found };
}
