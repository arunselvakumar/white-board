import type { AccessSession } from "@/app/api/_lib/require-access";
import { requireAccess } from "@/app/api/_lib/require-access";
import {
  isResponse,
  requireCompanySession,
} from "@/app/api/_lib/require-session";
import { createSiteDiaryHandlers } from "@/src/composition/site-records";
import type { StoredSiteDiary } from "@/src/site-work/application/site-diary-handlers";
import { SITE_WORK_DOCUMENTS } from "@/src/site-work/domain/site-work-documents";
import type { Flag } from "@/src/shared-kernel/access";

export const SITE_DIARY_MENU = SITE_WORK_DOCUMENTS.site_diary.menu;

/** One set of Site Diary handlers for every route (CM-607). */
export const siteDiaryHandlers = createSiteDiaryHandlers();

/**
 * The Session plus the Permission Matrix check for a route about one
 * diary: it is loaded first (404 for another Company's or a deleted one),
 * then `flag` is checked on its Project.
 */
export async function requireSiteDiaryAccess(
  request: Request,
  id: string,
  flag: Flag,
): Promise<(AccessSession & { target: StoredSiteDiary }) | Response> {
  const session = await requireCompanySession(request);
  if (isResponse(session)) return session;
  const target = await siteDiaryHandlers.find(session.workspaceId, id);
  const access = await requireAccess(request, SITE_DIARY_MENU, flag, {
    projectId: target.projectId,
  });
  if (isResponse(access)) return access;
  return { ...access, target };
}
