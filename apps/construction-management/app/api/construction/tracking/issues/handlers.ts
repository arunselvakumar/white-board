import { prisma } from "@repo/construction-db";

import type { AccessSession } from "@/app/api/_lib/require-access";
import { requireTrackingRecordAccess } from "@/app/api/construction/tracking/tracking-access";
import { createProjectLocations } from "@/src/composition/location-resolver";
import { projectMediaDispatcher } from "@/src/composition/project-media-listeners";
import { trackingDirectory } from "@/src/composition/tracking-directory";
import type { Flag } from "@/src/shared-kernel/access";
import { companyToday } from "@/src/shared-kernel/company-today";
import { InProcessEventDispatcher } from "@/src/shared-kernel/events";
import {
  IssueHandlers,
  type StoredIssue,
} from "@/src/tracking/application/issue-handlers";
import { TRACKING_DOCUMENTS } from "@/src/tracking/domain/tracking-documents";
import { PrismaIssueStore } from "@/src/tracking/infrastructure/issue-store";
import { loadBackdatedCheck } from "@/src/tracking/infrastructure/tracking-guards";

export const ISSUE_MENU = TRACKING_DOCUMENTS.issue.menu;

/** Issues & Snags handlers (CM-803) wired to Prisma and the TrackingDirectory. */
export function createIssueHandlers(): IssueHandlers {
  return new IssueHandlers({
    db: prisma,
    store: new PrismaIssueStore(),
    directory: trackingDirectory,
    locations: createProjectLocations(),
    backdated: (access) => loadBackdatedCheck(prisma, access),
    today: (workspaceId) => companyToday(prisma, workspaceId),
    // IssueAssigned / IssueUpdated / IssueSolved / IssueReopened: no listeners until M9.
    events: new InProcessEventDispatcher(),
    media: projectMediaDispatcher(),
  });
}

/** One set of handlers for every issue route. */
export const issueHandlers = createIssueHandlers();

/**
 * The Session plus the Permission Matrix check for a route about one
 * issue: it is loaded first (404 for another Company's or a deleted one),
 * then `flag` is checked on its Project. Visibility (View all) is the
 * handlers' check.
 */
export function requireIssueAccess(
  request: Request,
  id: string,
  flag: Flag,
): Promise<(AccessSession & { target: StoredIssue }) | Response> {
  return requireTrackingRecordAccess(request, ISSUE_MENU, flag, (workspaceId) =>
    issueHandlers.find(workspaceId, id),
  );
}
