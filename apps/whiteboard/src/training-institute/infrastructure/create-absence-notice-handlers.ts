import { prisma, type PrismaClient } from "@repo/whiteboard-db";

import { AbsenceNoticeHandlers } from "../application/absence-notice-handlers";
import type {
  AbsenceNoticeMailer,
  UserDirectory,
} from "../application/absence-notice-ports";
import { NotificationHandlers } from "../application/notification-handlers";
import {
  EmailAbsenceNoticeMailer,
  WorkspaceUserDirectory,
} from "./absence-notice-mailer";
import { PrismaAbsenceNoticeStore } from "./prisma-absence-notice-store";
import { PrismaNotificationStore } from "./prisma-notification-store";

export function createAbsenceNoticeHandlers(deps?: {
  prisma?: PrismaClient;
  users?: UserDirectory;
  mailer?: AbsenceNoticeMailer;
  now?: () => Date;
}): AbsenceNoticeHandlers {
  return new AbsenceNoticeHandlers({
    store: new PrismaAbsenceNoticeStore(deps?.prisma ?? prisma),
    users: deps?.users ?? new WorkspaceUserDirectory(),
    mailer: deps?.mailer ?? new EmailAbsenceNoticeMailer(),
    now: deps?.now ?? (() => new Date()),
  });
}

export function createNotificationHandlers(deps?: {
  prisma?: PrismaClient;
  now?: () => Date;
}): NotificationHandlers {
  return new NotificationHandlers({
    store: new PrismaNotificationStore(deps?.prisma ?? prisma),
    now: deps?.now ?? (() => new Date()),
  });
}
