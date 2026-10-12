// Ports for a User's Notifications under the bell (ADR-0041).

import type { ListCursor, ListPage } from "../domain/list";
import type {
  AbsenceNoticeNotificationPayload,
  NotificationKind,
} from "./absence-notice-views";

export type NotificationRecord = {
  id: string;
  kind: NotificationKind;
  payload: AbsenceNoticeNotificationPayload;
  createdAt: Date;
  readAt: Date | null;
};

export type NotificationCursor = ListCursor<{ value: string }>;

/** One recipient's Notifications in one Workspace; never anyone else's. */
export type NotificationStore = {
  /** Newest first, by creation time then id. */
  list(
    workspaceId: string,
    recipientUserId: string,
    page: {
      limit: number;
      after?: NotificationCursor;
      before?: NotificationCursor;
    },
  ): Promise<ListPage<NotificationRecord>>;
  unreadCount(workspaceId: string, recipientUserId: string): Promise<number>;
  find(
    workspaceId: string,
    recipientUserId: string,
    id: string,
  ): Promise<NotificationRecord | null>;
  /** Keeps the first read time. */
  markRead(
    workspaceId: string,
    recipientUserId: string,
    id: string,
    now: Date,
  ): Promise<void>;
  markAllRead(
    workspaceId: string,
    recipientUserId: string,
    now: Date,
  ): Promise<void>;
};
