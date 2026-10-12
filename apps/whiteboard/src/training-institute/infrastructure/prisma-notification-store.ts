import type { Prisma, PrismaClient } from "@repo/whiteboard-db";

import type { AbsenceNoticeNotificationPayload } from "../application/absence-notice-views";
import type {
  NotificationCursor,
  NotificationRecord,
  NotificationStore,
} from "../application/notification-ports";
import type { ListPage } from "../domain/list";

type NotificationRow = Prisma.TrainingInstituteNotificationGetPayload<
  Record<string, never>
>;

function toRecord(row: NotificationRow): NotificationRecord {
  return {
    id: row.id,
    kind: row.kind,
    payload: row.payload as unknown as AbsenceNoticeNotificationPayload,
    createdAt: row.createdAt,
    readAt: row.readAt,
  };
}

export class PrismaNotificationStore implements NotificationStore {
  constructor(private readonly db: PrismaClient) {}

  async list(
    workspaceId: string,
    recipientUserId: string,
    page: {
      limit: number;
      after?: NotificationCursor;
      before?: NotificationCursor;
    },
  ): Promise<ListPage<NotificationRecord>> {
    const where = { workspaceId, recipientUserId };
    const cursorWhere: Prisma.TrainingInstituteNotificationWhereInput =
      page.after != null
        ? {
            OR: [
              { createdAt: { lt: page.after.createdAt } },
              {
                createdAt: page.after.createdAt,
                id: { lt: page.after.id.value },
              },
            ],
          }
        : page.before != null
          ? {
              OR: [
                { createdAt: { gt: page.before.createdAt } },
                {
                  createdAt: page.before.createdAt,
                  id: { gt: page.before.id.value },
                },
              ],
            }
          : {};
    const direction = page.before != null ? "asc" : "desc";
    const [rows, total] = await Promise.all([
      this.db.trainingInstituteNotification.findMany({
        where: { ...where, ...cursorWhere },
        orderBy: [{ createdAt: direction }, { id: direction }],
        take: page.limit + 1,
      }),
      this.db.trainingInstituteNotification.count({ where }),
    ]);
    const hasMore = rows.length > page.limit;
    const pageRows = hasMore ? rows.slice(0, page.limit) : rows;
    return {
      items: (page.before != null ? [...pageRows].reverse() : pageRows).map(
        toRecord,
      ),
      total,
      hasMore,
    };
  }

  unreadCount(workspaceId: string, recipientUserId: string): Promise<number> {
    return this.db.trainingInstituteNotification.count({
      where: { workspaceId, recipientUserId, readAt: null },
    });
  }

  async find(
    workspaceId: string,
    recipientUserId: string,
    id: string,
  ): Promise<NotificationRecord | null> {
    const row = await this.db.trainingInstituteNotification.findFirst({
      where: { id, workspaceId, recipientUserId },
    });
    return row == null ? null : toRecord(row);
  }

  async markRead(
    workspaceId: string,
    recipientUserId: string,
    id: string,
    now: Date,
  ): Promise<void> {
    await this.db.trainingInstituteNotification.updateMany({
      where: { id, workspaceId, recipientUserId, readAt: null },
      data: { readAt: now },
    });
  }

  async markAllRead(
    workspaceId: string,
    recipientUserId: string,
    now: Date,
  ): Promise<void> {
    await this.db.trainingInstituteNotification.updateMany({
      where: { workspaceId, recipientUserId, readAt: null },
      data: { readAt: now },
    });
  }
}
