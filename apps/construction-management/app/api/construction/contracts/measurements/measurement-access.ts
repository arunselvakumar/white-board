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
import {
  measurementHandlers,
  measurementPhotos,
} from "@/src/composition/contracts-measurements";
import { MEASUREMENT_MENU } from "@/src/contracts/application/measurement-handlers";
import type { StoredMeasurementSheet } from "@/src/contracts/application/measurement-ports";
import { contractsProjectNotFound } from "@/src/contracts/domain/contracts-errors";
import type { Flag } from "@/src/shared-kernel/access";

export { MEASUREMENT_MENU, measurementHandlers, measurementPhotos };

type Flags = Flag | readonly [Flag, ...Flag[]];

const ProjectScope = z.object({ projectId: z.uuid() });

/**
 * The Project a Measurement Book request is for (a query string or a JSON
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
    ? requireAccess(request, MEASUREMENT_MENU, flags, { projectId })
    : requireAnyAccess(request, MEASUREMENT_MENU, flags, { projectId });
}

/**
 * The Session plus the Measurement Book check on a Project (CM-1105): 401
 * / 403 as `requireAccess` (403 `PERMISSION_DENIED` for a Team Member not
 * on the Project), then 404 `PROJECT_NOT_FOUND` when it is not a live
 * Project of the Company. With several flags, any one is enough.
 */
export async function requireMeasurementProjectAccess(
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
 * The Session plus the Measurement Book check for one sheet: found in the
 * caller's Company first (404 `MEASUREMENT_NOT_FOUND` for another
 * Company's or a deleted one), then `flags` on its Project.
 */
export async function requireMeasurementAccess(
  request: Request,
  flags: Flags,
  id: string,
): Promise<(AccessSession & { target: StoredMeasurementSheet }) | Response> {
  const session = await requireCompanySession(request);
  if (isResponse(session)) return session;
  const target = await measurementHandlers.find(session.workspaceId, id);
  const access = await check(request, flags, target.projectId);
  if (isResponse(access)) return access;
  return { ...access, target };
}
