import { prisma } from "@repo/construction-db";

import {
  requireAccess,
  requireAnyAccess,
  type AccessSession,
} from "@/app/api/_lib/require-access";
import {
  isResponse,
  requireCompanySession,
} from "@/app/api/_lib/require-session";
import { salesDirectory } from "@/src/composition/sales-directory";
import type { Flag, MenuKey } from "@/src/shared-kernel/access";
import type { SalesProjectFacts } from "@/src/sales/application/ports";
import { salesProjectNotFound } from "@/src/sales/domain/sales-errors";

type Flags = Flag | readonly [Flag, ...Flag[]];

function check(
  request: Request,
  menu: MenuKey,
  flags: Flags,
  projectId: string,
): Promise<AccessSession | Response> {
  return typeof flags === "string"
    ? requireAccess(request, menu, flags, { projectId })
    : requireAnyAccess(request, menu, flags, { projectId });
}

/**
 * The Session plus the Permission Matrix check for a sales request on a
 * Project (a list, a create, form options): 401 / 403 as `requireAccess`
 * (403 `PERMISSION_DENIED` for a member not on the Project), then 404
 * `PROJECT_NOT_FOUND` (thrown; `mapError` answers it) when the Project is
 * not a live Project of the Company — the Owner of another Company
 * included. With several flags, any one of them is enough.
 *
 * Read the id with `requestProjectId(raw)` first so access is checked
 * before the rest of the request is validated.
 */
export async function requireSalesProjectAccess(
  request: Request,
  menu: MenuKey,
  flags: Flags,
  projectId: string,
): Promise<(AccessSession & { project: SalesProjectFacts }) | Response> {
  const session = await check(request, menu, flags, projectId);
  if (isResponse(session)) return session;
  const project = await salesDirectory.project(
    prisma,
    session.workspaceId,
    projectId,
  );
  if (project == null) throw salesProjectNotFound();
  return { ...session, project };
}

/**
 * The Session plus the Permission Matrix check for a request about one
 * sales record (an inquiry, a booking): `load` finds it in
 * the caller's Company first and throws its own 404 for another Company's
 * or a deleted one; then `flags` are checked on its Project. Returns the
 * record as `target`.
 */
export async function requireSalesRecordAccess<T extends { projectId: string }>(
  request: Request,
  menu: MenuKey,
  flags: Flags,
  load: (workspaceId: string) => Promise<T>,
): Promise<(AccessSession & { target: T }) | Response> {
  const session = await requireCompanySession(request);
  if (isResponse(session)) return session;
  const target = await load(session.workspaceId);
  const access = await check(request, menu, flags, target.projectId);
  if (isResponse(access)) return access;
  return { ...access, target };
}
