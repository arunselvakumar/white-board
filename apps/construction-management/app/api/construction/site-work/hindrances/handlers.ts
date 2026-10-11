import type { AccessSession } from "@/app/api/_lib/require-access";
import { requireAccess } from "@/app/api/_lib/require-access";
import {
  isResponse,
  requireCompanySession,
} from "@/app/api/_lib/require-session";
import { createHindranceHandlers } from "@/src/composition/site-records";
import type { StoredHindrance } from "@/src/site-work/application/hindrance-handlers";
import { SITE_WORK_DOCUMENTS } from "@/src/site-work/domain/site-work-documents";
import type { Flag } from "@/src/shared-kernel/access";

export const HINDRANCE_MENU = SITE_WORK_DOCUMENTS.hindrance.menu;

/** One set of Hindrance register handlers for every route (CM-607). */
export const hindranceHandlers = createHindranceHandlers();

/**
 * The Session plus the Permission Matrix check for a route about one
 * hindrance: it is loaded first (404 for another Company's or a deleted
 * one), then `flag` is checked on its Project.
 */
export async function requireHindranceAccess(
  request: Request,
  id: string,
  flag: Flag,
): Promise<(AccessSession & { target: StoredHindrance }) | Response> {
  const session = await requireCompanySession(request);
  if (isResponse(session)) return session;
  const target = await hindranceHandlers.find(session.workspaceId, id);
  const access = await requireAccess(request, HINDRANCE_MENU, flag, {
    projectId: target.projectId,
  });
  if (isResponse(access)) return access;
  return { ...access, target };
}
