// The bell (ADR-0041): a User's own Notifications in the Active Workspace.

import { DomainError } from "../domain/errors";
import type {
  NotificationView,
  NotificationsView,
  UnreadNotificationsView,
} from "./absence-notice-views";
import { decodeListCursor, encodeListCursor } from "./list-cursor";
import type {
  NotificationRecord,
  NotificationStore,
} from "./notification-ports";

/** The session User, who is always the recipient. */
export type NotificationRecipient = { workspaceId: string; userId: string };

function view(record: NotificationRecord): NotificationView {
  return {
    id: record.id,
    kind: record.kind,
    payload: record.payload,
    createdAt: record.createdAt.toISOString(),
    readAt: record.readAt?.toISOString() ?? null,
  };
}

function cursorOf(record: NotificationRecord): string {
  return encodeListCursor({
    createdAt: record.createdAt,
    id: { value: record.id },
  });
}

export class NotificationHandlers {
  constructor(
    private readonly deps: { store: NotificationStore; now: () => Date },
  ) {}

  /** Newest first, with bidirectional cursors (ADR-0020). */
  async list(
    recipient: NotificationRecipient,
    query: { limit: number; after?: string; before?: string },
  ): Promise<NotificationsView> {
    const parseId = (id: string) => ({ value: id });
    const after =
      query.after == null ? undefined : decodeListCursor(query.after, parseId);
    const before =
      query.before == null
        ? undefined
        : decodeListCursor(query.before, parseId);
    const [page, unreadCount] = await Promise.all([
      this.deps.store.list(recipient.workspaceId, recipient.userId, {
        limit: query.limit,
        after,
        before,
      }),
      this.deps.store.unreadCount(recipient.workspaceId, recipient.userId),
    ]);
    const first = page.items[0];
    const last = page.items.at(-1);
    return {
      items: page.items.map(view),
      total: page.total,
      unreadCount,
      nextCursor:
        last != null && (query.before != null || page.hasMore)
          ? cursorOf(last)
          : null,
      prevCursor:
        first != null &&
        (query.after != null || (query.before != null && page.hasMore))
          ? cursorOf(first)
          : null,
    };
  }

  async unreadCount(
    recipient: NotificationRecipient,
  ): Promise<UnreadNotificationsView> {
    return {
      unreadCount: await this.deps.store.unreadCount(
        recipient.workspaceId,
        recipient.userId,
      ),
    };
  }

  /** Someone else's Notification is 404 NOTIFICATION_NOT_FOUND. */
  async markRead(
    recipient: NotificationRecipient,
    id: string,
  ): Promise<NotificationView> {
    const { workspaceId, userId } = recipient;
    const found = await this.deps.store.find(workspaceId, userId, id);
    if (found == null)
      throw new DomainError(
        "NOTIFICATION_NOT_FOUND",
        "Notification not found.",
      );
    if (found.readAt == null)
      await this.deps.store.markRead(workspaceId, userId, id, this.deps.now());
    const updated = await this.deps.store.find(workspaceId, userId, id);
    return view(updated ?? found);
  }

  async markAllRead(
    recipient: NotificationRecipient,
  ): Promise<UnreadNotificationsView> {
    await this.deps.store.markAllRead(
      recipient.workspaceId,
      recipient.userId,
      this.deps.now(),
    );
    return this.unreadCount(recipient);
  }
}
