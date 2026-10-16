import { Prisma, type PrismaClient } from "@repo/construction-db";

import { newId } from "@/src/shared-kernel/ids";
import { enqueueJob } from "@/src/shared-kernel/queue";

import type { NotificationAttachment } from "../domain/notification";
import type {
  NotificationRecord,
  NotificationStore,
} from "../application/ports";
import { PUSH_QUEUE_TYPE, pushJobPayload } from "../application/push-delivery";

type Row = {
  id: string;
  workspaceId: string;
  recipientUserId: string;
  menu: string | null;
  projectId: string | null;
  type: string;
  title: string;
  body: string | null;
  link: Prisma.JsonValue;
  attachment: Prisma.JsonValue;
  readAt: Date | null;
  deletedAt: Date | null;
  createdAt: Date;
};

function hrefOf(link: Prisma.JsonValue): string | null {
  if (link == null || typeof link !== "object" || Array.isArray(link))
    return null;
  const href = link["href"];
  return typeof href === "string" ? href : null;
}

function attachmentOf(value: Prisma.JsonValue): NotificationAttachment | null {
  if (value == null || typeof value !== "object" || Array.isArray(value))
    return null;
  const { kind, id, downloads } = value as Record<string, unknown>;
  if (
    (kind !== "report" && kind !== "backup" && kind !== "export") ||
    typeof id !== "string"
  )
    return null;
  return {
    kind,
    id,
    downloads: Array.isArray(downloads)
      ? downloads.flatMap((item: unknown) => {
          const entry = item as { label?: unknown; href?: unknown } | null;
          return typeof entry?.label === "string" &&
            typeof entry.href === "string"
            ? [{ label: entry.label, href: entry.href }]
            : [];
        })
      : [],
  };
}

function toRecord(row: Row): NotificationRecord {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    recipientUserId: row.recipientUserId,
    menu: row.menu,
    projectId: row.projectId,
    type: row.type,
    title: row.title,
    body: row.body,
    href: hrefOf(row.link),
    attachment: attachmentOf(row.attachment),
    readAt: row.readAt,
    deletedAt: row.deletedAt,
    createdAt: row.createdAt,
  };
}

/** `construction_messaging.notifications` and its delivery log. */
export function prismaNotificationStore(db: PrismaClient): NotificationStore {
  const notifications = db.constructionMessagingNotification;
  return {
    async insert(rows, now) {
      if (rows.length === 0) return { notificationIds: [], pushJobIds: [] };
      return db.$transaction(async (tx) => {
        const created =
          await tx.constructionMessagingNotification.createManyAndReturn({
            data: rows.map((row) => ({
              id: newId(now.getTime()),
              workspaceId: row.workspaceId,
              recipientUserId: row.recipientUserId,
              menu: row.menu,
              projectId: row.projectId,
              type: row.type,
              title: row.title,
              body: row.body,
              link: row.href == null ? Prisma.DbNull : { href: row.href },
              attachment: row.attachment ?? Prisma.DbNull,
              sourceKey: row.sourceKey,
              createdAt: now,
            })),
            skipDuplicates: true,
            select: { id: true, workspaceId: true, recipientUserId: true },
          });
        if (created.length === 0)
          return { notificationIds: [], pushJobIds: [] };
        await tx.constructionMessagingNotificationDelivery.createMany({
          data: created.map((row) => ({
            id: newId(now.getTime()),
            notificationId: row.id,
            workspaceId: row.workspaceId,
            recipientUserId: row.recipientUserId,
            channel: "in_app" as const,
            status: "sent" as const,
            createdAt: now,
          })),
        });
        const pushJobIds: string[] = [];
        for (const row of created)
          pushJobIds.push(
            await enqueueJob(
              tx,
              {
                type: PUSH_QUEUE_TYPE,
                workspaceId: row.workspaceId,
                payload: pushJobPayload(row.id),
                maxAttempts: 1,
              },
              now,
            ),
          );
        return { notificationIds: created.map((row) => row.id), pushJobIds };
      });
    },

    async list({ workspaceId, userId, cursor, limit }) {
      const rows = await notifications.findMany({
        where: {
          workspaceId,
          recipientUserId: userId,
          deletedAt: null,
          ...(cursor == null
            ? {}
            : {
                OR: [
                  { createdAt: { lt: cursor.createdAt } },
                  { createdAt: cursor.createdAt, id: { lt: cursor.id } },
                ],
              }),
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: limit,
      });
      return rows.map(toRecord);
    },

    unreadCount(workspaceId, userId) {
      return notifications.count({
        where: {
          workspaceId,
          recipientUserId: userId,
          readAt: null,
          deletedAt: null,
        },
      });
    },

    async latestUnread({ workspaceId, userId, types, since }) {
      const row = await notifications.findFirst({
        where: {
          workspaceId,
          recipientUserId: userId,
          type: { in: [...types] },
          readAt: null,
          deletedAt: null,
          createdAt: { gte: since },
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      });
      return row == null ? null : toRecord(row);
    },

    async markRead({ workspaceId, userId, id }, at) {
      const scope = {
        id,
        workspaceId,
        recipientUserId: userId,
        deletedAt: null,
      };
      await notifications.updateMany({
        where: { ...scope, readAt: null },
        data: { readAt: at },
      });
      const row = await notifications.findFirst({ where: scope });
      return row == null ? null : toRecord(row);
    },

    async markAllRead(workspaceId, userId, at) {
      const { count } = await notifications.updateMany({
        where: {
          workspaceId,
          recipientUserId: userId,
          readAt: null,
          deletedAt: null,
        },
        data: { readAt: at },
      });
      return count;
    },

    async hide({ workspaceId, userId, id }, at) {
      const { count } = await notifications.updateMany({
        where: { id, workspaceId, recipientUserId: userId, deletedAt: null },
        data: { deletedAt: at },
      });
      return count > 0;
    },

    async find(id) {
      const row = await notifications.findUnique({ where: { id } });
      return row == null ? null : toRecord(row);
    },

    async logDeliveries(rows, at) {
      if (rows.length === 0) return;
      await db.constructionMessagingNotificationDelivery.createMany({
        data: rows.map((row) => ({
          id: newId(at.getTime()),
          notificationId: row.notificationId,
          workspaceId: row.workspaceId,
          recipientUserId: row.recipientUserId,
          channel: row.channel,
          status: row.status,
          pushSubscriptionId: row.pushSubscriptionId ?? null,
          error: row.error ?? null,
          createdAt: at,
        })),
      });
    },

    async purge({ notificationsBefore, deliveriesBefore }) {
      // Deliveries first: a notification's delete only nulls their link.
      const deliveries =
        await db.constructionMessagingNotificationDelivery.deleteMany({
          where: { createdAt: { lt: deliveriesBefore } },
        });
      const removed = await notifications.deleteMany({
        where: { createdAt: { lt: notificationsBefore } },
      });
      return { notifications: removed.count, deliveries: deliveries.count };
    },
  };
}
