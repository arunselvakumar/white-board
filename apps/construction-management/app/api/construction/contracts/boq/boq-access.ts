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
import {
  boqHandlers,
  variationHandlers,
} from "@/src/composition/contracts-boq";
import { contractsDirectory } from "@/src/composition/contracts-directory";
import { BOQ_MENU } from "@/src/contracts/application/boq-handlers";
import type { ContractsProjectFacts } from "@/src/contracts/application/ports";
import { contractsProjectNotFound } from "@/src/contracts/domain/contracts-errors";
import type { Flag } from "@/src/shared-kernel/access";

export { BOQ_MENU, boqHandlers, variationHandlers };

type Flags = Flag | readonly [Flag, ...Flag[]];

const ProjectScope = z.object({ projectId: z.uuid() });

/**
 * The Project a BOQ request is for (a query string or a JSON body), read
 * before the rest is validated, so access is checked first.
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
    ? requireAccess(request, BOQ_MENU, flags, { projectId })
    : requireAnyAccess(request, BOQ_MENU, flags, { projectId });
}

/**
 * The Session plus the BOQ menu check on a Project (CM-1103): 401 / 403 as
 * `requireAccess` (403 `PERMISSION_DENIED` for a Team Member not on the
 * Project), then 404 `PROJECT_NOT_FOUND` when it is not a live Project of
 * the Company, the Owner of another Company included. With several flags,
 * any one is enough.
 */
export async function requireBoqProjectAccess(
  request: Request,
  flags: Flags,
  projectId: string,
): Promise<(AccessSession & { project: ContractsProjectFacts }) | Response> {
  const session = await check(request, flags, projectId);
  if (isResponse(session)) return session;
  const project = await contractsDirectory.project(
    prisma,
    session.workspaceId,
    projectId,
  );
  if (project == null) throw contractsProjectNotFound();
  return { ...session, project };
}

/**
 * The Session plus the BOQ menu check for one record (a section, an item,
 * a Variation): `load` finds it in the caller's Company first (its own 404
 * for another Company's or a deleted one), then `flags` are checked on its
 * Project.
 */
export async function requireBoqRecordAccess<T extends { projectId: string }>(
  request: Request,
  flags: Flags,
  load: (workspaceId: string) => Promise<T>,
): Promise<(AccessSession & { target: T }) | Response> {
  const session = await requireCompanySession(request);
  if (isResponse(session)) return session;
  const target = await load(session.workspaceId);
  const access = await check(request, flags, target.projectId);
  if (isResponse(access)) return access;
  return { ...access, target };
}
