import { prisma } from "@repo/construction-db";

import type { AccessSession } from "@/app/api/_lib/require-access";
import { requireAccess } from "@/app/api/_lib/require-access";
import {
  isResponse,
  requireCompanySession,
} from "@/app/api/_lib/require-session";
import { createProjectLocations } from "@/src/composition/location-resolver";
import { projectMediaDispatcher } from "@/src/composition/project-media-listeners";
import { siteWorkStock } from "@/src/composition/site-work-stock";
import { trackingTaskProgressPosting } from "@/src/composition/task-progress-posting";
import {
  attendanceHeadcounts,
  worksheetDirectory,
} from "@/src/composition/worksheet-directory";
import type { Flag } from "@/src/shared-kernel/access";
import { companyToday } from "@/src/shared-kernel/company-today";
import { messagingEvents } from "@/src/composition/messaging";
import {
  WorksheetHandlers,
  type StoredWorksheet,
} from "@/src/site-work/application/worksheet-handlers";
import { WorksheetSettingsHandlers } from "@/src/site-work/application/worksheet-settings-handlers";
import { SITE_WORK_DOCUMENTS } from "@/src/site-work/domain/site-work-documents";
import {
  PrismaWorksheetSettingsStore,
  PrismaWorksheetStore,
} from "@/src/site-work/infrastructure/prisma-worksheet-store";
import { loadBackdatedCheck } from "@/src/site-work/infrastructure/site-work-guards";

export const WORKSHEET_MENU = SITE_WORK_DOCUMENTS.worksheet.menu;

/** The Project's worksheet settings (CM-0016 §2), for the settings routes too. */
export const worksheetSettingsHandlers = new WorksheetSettingsHandlers({
  db: prisma,
  store: new PrismaWorksheetSettingsStore(),
  projectExists: async (workspaceId, projectId) =>
    (await worksheetDirectory.projectName(prisma, workspaceId, projectId)) !=
    null,
});

/** One set of Daily Worksheet handlers for every route (CM-602). */
export const worksheetHandlers = new WorksheetHandlers({
  db: prisma,
  store: new PrismaWorksheetStore(),
  settings: worksheetSettingsHandlers,
  directory: worksheetDirectory,
  attendance: attendanceHeadcounts,
  locations: createProjectLocations(),
  stock: siteWorkStock(),
  tasks: trackingTaskProgressPosting,
  backdated: (access) => loadBackdatedCheck(prisma, access),
  today: (workspaceId) => companyToday(prisma, workspaceId),
  // Nothing listens to `document.approved` for worksheets yet (M9 notifies).
  events: messagingEvents(),
  media: projectMediaDispatcher(),
});

/**
 * The Session plus the Permission Matrix check for a route about one
 * worksheet: it is loaded first (404 for another Company's or a deleted
 * one), then `flag` is checked on its Project, then the plan for a write
 * flag.
 */
export async function requireWorksheetAccess(
  request: Request,
  id: string,
  flag: Flag,
): Promise<(AccessSession & { target: StoredWorksheet }) | Response> {
  const session = await requireCompanySession(request);
  if (isResponse(session)) return session;
  const target = await worksheetHandlers.find(session.workspaceId, id);
  const access = await requireAccess(request, WORKSHEET_MENU, flag, {
    projectId: target.projectId,
  });
  if (isResponse(access)) return access;
  return { ...access, target };
}
