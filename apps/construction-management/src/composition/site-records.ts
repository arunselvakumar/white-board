import { prisma } from "@repo/construction-db";

import { createProjectLocations } from "@/src/composition/location-resolver";
import { projectMediaDispatcher } from "@/src/composition/project-media-listeners";
import { siteRecordDirectory } from "@/src/composition/site-record-directory";
import { companyToday } from "@/src/shared-kernel/company-today";
import { HindranceHandlers } from "@/src/site-work/application/hindrance-handlers";
import { SiteDiaryHandlers } from "@/src/site-work/application/site-diary-handlers";
import {
  SiteRecordQueries,
  type SiteRecordReads,
} from "@/src/site-work/application/site-record-queries";
import { PrismaHindranceStore } from "@/src/site-work/infrastructure/prisma-hindrance-store";
import { PrismaSiteDiaryStore } from "@/src/site-work/infrastructure/prisma-site-diary-store";
import { loadBackdatedCheck } from "@/src/site-work/infrastructure/site-work-guards";

/**
 * The Site Diary and Hindrance register handlers (CM-607) wired to Prisma,
 * the `SiteRecordDirectory` and the Project's LocationResolver. Routes and
 * the Daily Progress Report (CM-606) share them.
 */
export function createSiteDiaryHandlers(): SiteDiaryHandlers {
  return new SiteDiaryHandlers({
    db: prisma,
    store: new PrismaSiteDiaryStore(),
    directory: siteRecordDirectory(),
    backdated: (access) => loadBackdatedCheck(prisma, access),
    today: (workspaceId) => companyToday(prisma, workspaceId),
    media: projectMediaDispatcher(),
  });
}

export function createHindranceHandlers(): HindranceHandlers {
  return new HindranceHandlers({
    db: prisma,
    store: new PrismaHindranceStore(),
    directory: siteRecordDirectory(),
    locations: createProjectLocations(),
    backdated: (access) => loadBackdatedCheck(prisma, access),
    today: (workspaceId) => companyToday(prisma, workspaceId),
    media: projectMediaDispatcher(),
  });
}

/**
 * What the DPR reads of the Site Diary and the Hindrance register for a
 * Project and date: `diaryForDate` and `hindrancesOn` (CM-0016 §15).
 */
export function createSiteRecordQueries(): SiteRecordReads {
  const store = new PrismaHindranceStore();
  return new SiteRecordQueries(
    createSiteDiaryHandlers(),
    createHindranceHandlers(),
    (workspaceId, projectId, date) =>
      store.openOn(prisma, workspaceId, projectId, date),
  );
}
