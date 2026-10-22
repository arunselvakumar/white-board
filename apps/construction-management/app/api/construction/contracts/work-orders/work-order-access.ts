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
import { contractsDirectory } from "@/src/composition/contracts-directory";
import { workOrderHandlers } from "@/src/composition/contracts-work-orders";
import { WORK_ORDER_MENU } from "@/src/contracts/application/work-order-handlers";
import type { StoredWorkOrder } from "@/src/contracts/application/work-order-ports";
import { contractsProjectNotFound } from "@/src/contracts/domain/contracts-errors";
import type { Flag } from "@/src/shared-kernel/access";

export { WORK_ORDER_MENU, workOrderHandlers };

type Flags = Flag | readonly [Flag, ...Flag[]];

const ProjectScope = z.object({ projectId: z.uuid() });

/**
 * The Project a Work Order request is for (a query string or a JSON body),
 * read before the rest is validated, so access is checked first.
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
    ? requireAccess(request, WORK_ORDER_MENU, flags, { projectId })
    : requireAnyAccess(request, WORK_ORDER_MENU, flags, { projectId });
}

/**
 * The Session plus the Work Order menu check on a Project (CM-1104): 401 /
 * 403 as `requireAccess` (403 `PERMISSION_DENIED` for a Team Member not on
 * the Project), then 404 `PROJECT_NOT_FOUND` when it is not a live Project
 * of the Company. With several flags, any one is enough.
 */
export async function requireWorkOrderProjectAccess(
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
 * The Session plus the Work Order menu check for one Work Order: found in
 * the caller's Company first (404 `WORK_ORDER_NOT_FOUND` for another
 * Company's or a deleted one), then `flags` on its Project.
 */
export async function requireWorkOrderAccess(
  request: Request,
  flags: Flags,
  id: string,
): Promise<(AccessSession & { target: StoredWorkOrder }) | Response> {
  const session = await requireCompanySession(request);
  if (isResponse(session)) return session;
  const target = await workOrderHandlers.find(session.workspaceId, id);
  const access = await check(request, flags, target.projectId);
  if (isResponse(access)) return access;
  return { ...access, target };
}
