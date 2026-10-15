import { prisma } from "@repo/construction-db";

import { createProjectLocations } from "@/src/composition/location-resolver";
import { projectMediaDispatcher } from "@/src/composition/project-media-listeners";
import { masterTaskTags } from "@/src/composition/task-tags";
import { siteWorkTaskUsage } from "@/src/composition/task-usage";
import { trackingDirectory } from "@/src/composition/tracking-directory";
import { companyToday } from "@/src/shared-kernel/company-today";
import { InProcessEventDispatcher } from "@/src/shared-kernel/events";
import { TaskHandlers } from "@/src/tracking/application/task-handlers";
import type { TaskImportDeps } from "@/src/tracking/application/task-import";
import { prismaTaskStore } from "@/src/tracking/infrastructure/prisma-task-store";

/**
 * Task handlers (CM-802) wired to Prisma, the `TrackingDirectory`, the
 * Project's LocationResolver and the worksheet usage check. Task events
 * have no listeners until M9.
 */
export function createTaskHandlers(): TaskHandlers {
  return new TaskHandlers({
    db: prisma,
    store: prismaTaskStore,
    directory: trackingDirectory,
    locations: createProjectLocations(),
    usage: siteWorkTaskUsage,
    today: (workspaceId) => companyToday(prisma, workspaceId),
    events: new InProcessEventDispatcher(),
    media: projectMediaDispatcher(),
  });
}

/** What the task import needs (CM-802): the store, names and tag create. */
export function createTaskImportDeps(): TaskImportDeps {
  return {
    db: prisma,
    store: prismaTaskStore,
    directory: trackingDirectory,
    tags: masterTaskTags(),
  };
}
