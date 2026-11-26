import { prisma, type PrismaClient } from "@repo/whiteboard-db";

import { AnnouncementHandlers } from "../application/announcement-handlers";
import type { AnnouncementNotifier } from "../application/announcement-ports";
import { EmailAnnouncementNotifier } from "./email-announcement-notifier";
import { PrismaAnnouncementStore } from "./prisma-announcement-store";

export function createAnnouncementHandlers(deps?: {
  prisma?: PrismaClient;
  notifier?: AnnouncementNotifier;
  now?: () => Date;
}): AnnouncementHandlers {
  return new AnnouncementHandlers({
    store: new PrismaAnnouncementStore(deps?.prisma ?? prisma),
    notifier: deps?.notifier ?? new EmailAnnouncementNotifier(),
    now: deps?.now ?? (() => new Date()),
  });
}
