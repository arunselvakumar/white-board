import { prisma } from "@repo/construction-db";
import { z } from "zod";

import { parseOrThrow } from "@/app/api/_lib/map-error";
import {
  requireAccess,
  requireAnyAccess,
  type AccessSession,
} from "@/app/api/_lib/require-access";
import {
  isResponse,
  requireCompanySession,
} from "@/app/api/_lib/require-session";
import { clientBillHandlers } from "@/src/composition/contracts-client-bills";
import { contractsDirectory } from "@/src/composition/contracts-directory";
import { CLIENT_BILL_MENU } from "@/src/contracts/application/client-bill-handlers";
import type { StoredClientBill } from "@/src/contracts/application/client-bill-ports";
import { contractsProjectNotFound } from "@/src/contracts/domain/contracts-errors";
import type { Flag } from "@/src/shared-kernel/access";

export { CLIENT_BILL_MENU, clientBillHandlers };

type Flags = Flag | readonly [Flag, ...Flag[]];

const ProjectScope = z.object({ projectId: z.uuid() });

/**
 * The Project a Client Bill request is for (a query string or a JSON
 * body), read before the rest is validated, so access is checked first.
 */
export function requestProjectId(raw: unknown): string {
  return parseOrThrow(ProjectScope.safeParse(raw)).projectId;
}

function check(
  request: Request,
  flags: Flags,
  projectId: string,
): Promise<AccessSession | Response> {
  return typeof flags === "string"
    ? requireAccess(request, CLIENT_BILL_MENU, flags, { projectId })
    : requireAnyAccess(request, CLIENT_BILL_MENU, flags, { projectId });
}

/**
 * The Session plus the Client Bill menu check on a Project (CM-1107): 401
 * / 403 as `requireAccess` (403 `PERMISSION_DENIED` for a Team Member not
 * on the Project), then 404 `PROJECT_NOT_FOUND` when it is not a live
 * Project of the Company. With several flags, any one is enough.
 */
export async function requireClientBillProjectAccess(
  request: Request,
  flags: Flags,
  projectId: string,
): Promise<AccessSession | Response> {
  const session = await check(request, flags, projectId);
  if (isResponse(session)) return session;
  const project = await contractsDirectory.project(
    prisma,
    session.workspaceId,
    projectId,
  );
  if (project == null) throw contractsProjectNotFound();
  return session;
}

/**
 * The Session plus the Client Bill menu check for one bill: found in the
 * caller's Company first (404 `BILL_NOT_FOUND` for another Company's or a
 * deleted one), then `flags` on its Project.
 */
export async function requireClientBillAccess(
  request: Request,
  flags: Flags,
  id: string,
): Promise<(AccessSession & { target: StoredClientBill }) | Response> {
  const session = await requireCompanySession(request);
  if (isResponse(session)) return session;
  const target = await clientBillHandlers.find(session.workspaceId, id);
  const access = await check(request, flags, target.projectId);
  if (isResponse(access)) return access;
  return { ...access, target };
}
