import { prisma } from "@repo/construction-db";

import { trackingDirectory } from "@/src/composition/tracking-directory";
import { TrackingDashboard } from "@/src/tracking/application/tracking-dashboard";
import { prismaTaskStore } from "@/src/tracking/infrastructure/prisma-task-store";
import { prismaTrackingDashboardStore } from "@/src/tracking/infrastructure/prisma-tracking-dashboard-store";

/** The Company's time zone from its profile; India when unset. */
export async function companyTimezone(workspaceId: string): Promise<string> {
  const profile =
    await prisma.constructionOrganizationCompanyProfile.findUnique({
      where: { workspaceId },
      select: { timezone: true },
    });
  const zone = profile?.timezone ?? "Asia/Kolkata";
  try {
    new Intl.DateTimeFormat("en-IN", { timeZone: zone });
    return zone;
  } catch {
    return "Asia/Kolkata";
  }
}

/**
 * The Project Dashboard's Task, Issue & Snag and Inspection Request
 * sections (CM-805) wired to Prisma and the `TrackingDirectory`.
 */
export function createTrackingDashboard(): TrackingDashboard {
  return new TrackingDashboard({
    db: prisma,
    tasks: prismaTaskStore,
    store: prismaTrackingDashboardStore,
    directory: trackingDirectory,
    timezone: companyTimezone,
  });
}
