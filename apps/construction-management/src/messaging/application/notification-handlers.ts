import { notFound, DomainError } from "@/src/shared-kernel/domain-error";
import {
  decodeListCursor,
  encodeListCursor,
} from "@/src/shared-kernel/list-cursor";

import {
  NOTIFICATION_GROUPS,
  NOTIFICATION_LIMITS,
  READY_TOAST_WINDOW_MS,
  isNotificationGroup,
  notificationGroup,
  type NotificationAttachment,
} from "../domain/notification";
import { READY_TYPES } from "../domain/notification-kinds";
import type {
  NotificationRecord,
  NotificationStore,
  PreferenceStore,
  PushSubscriptionStore,
} from "./ports";

/** A notification as the member's list shows it. */
export type NotificationReadModel = {
  id: string;
  type: string;
  menu: string | null;
  group: string;
  projectId: string | null;
  title: string;
  body: string | null;
  href: string | null;
  attachment: NotificationAttachment | null;
  readAt: Date | null;
  createdAt: Date;
};

export type NotificationPreferences = {
  groups: { key: string; label: string; muted: boolean }[];
};

/** Whose list: one member in the Active Company. */
export type Reader = { workspaceId: string; userId: string };

export type NotificationHandlersDeps = {
  store: NotificationStore;
  preferences: PreferenceStore;
  subscriptions: PushSubscriptionStore;
  clock?: () => Date;
};

function toReadModel(record: NotificationRecord): NotificationReadModel {
  return {
    id: record.id,
    type: record.type,
    menu: record.menu,
    group: notificationGroup(record.menu),
    projectId: record.projectId,
    title: record.title,
    body: record.body,
    href: record.href,
    attachment: record.attachment,
    readAt: record.readAt,
    createdAt: record.createdAt,
  };
}

function notificationNotFound(): DomainError {
  return notFound("NOTIFICATION_NOT_FOUND", "There is no such notification.");
}

/**
 * The member's notifications (CM-904): their own, in the Active Company
 * only. Every member may read theirs; no matrix flag is needed.
 */
export class NotificationHandlers {
  constructor(private readonly deps: NotificationHandlersDeps) {}

  private now(): Date {
    return (this.deps.clock ?? (() => new Date()))();
  }

  async list(
    reader: Reader,
    params: { cursor?: string | null; limit?: number },
  ): Promise<{ items: NotificationReadModel[]; nextCursor: string | null }> {
    const limit = Math.min(
      Math.max(params.limit ?? 20, 1),
      NOTIFICATION_LIMITS.maxPage,
    );
    const cursor =
      params.cursor == null || params.cursor === ""
        ? null
        : decodeListCursor(params.cursor);
    const rows = await this.deps.store.list({
      ...reader,
      cursor,
      limit: limit + 1,
    });
    const page = rows.slice(0, limit);
    const last = page.at(-1);
    return {
      items: page.map(toReadModel),
      nextCursor:
        rows.length > limit && last != null
          ? encodeListCursor({ createdAt: last.createdAt, id: last.id })
          : null,
    };
  }

  /**
   * The bell's count, and the newest unread "ready" notification of the
   * last hour for the Download toast (ADR CM-0021 §6).
   */
  async unread(reader: Reader): Promise<{
    count: number;
    latestReadyDownload: NotificationReadModel | null;
  }> {
    const [count, latest] = await Promise.all([
      this.deps.store.unreadCount(reader.workspaceId, reader.userId),
      this.deps.store.latestUnread({
        ...reader,
        types: READY_TYPES,
        since: new Date(this.now().getTime() - READY_TOAST_WINDOW_MS),
      }),
    ]);
    return {
      count,
      latestReadyDownload: latest == null ? null : toReadModel(latest),
    };
  }

  async markRead(reader: Reader, id: string): Promise<NotificationReadModel> {
    const record = await this.deps.store.markRead(
      { ...reader, id },
      this.now(),
    );
    if (record == null) throw notificationNotFound();
    return toReadModel(record);
  }

  async markAllRead(reader: Reader): Promise<{ updated: number }> {
    return {
      updated: await this.deps.store.markAllRead(
        reader.workspaceId,
        reader.userId,
        this.now(),
      ),
    };
  }

  /** Hides it from the list; the delivery log stays (ADR CM-0021 §3). */
  async delete(reader: Reader, id: string): Promise<void> {
    if (!(await this.deps.store.hide({ ...reader, id }, this.now())))
      throw notificationNotFound();
  }

  async preferences(userId: string): Promise<NotificationPreferences> {
    const muted = new Set(await this.deps.preferences.mutedGroups(userId));
    return {
      groups: NOTIFICATION_GROUPS.map((group) => ({
        ...group,
        muted: muted.has(group.key),
      })),
    };
  }

  /** Mutes push for these groups (in-app stays: the N flag decides it). */
  async updatePreferences(
    userId: string,
    mutedGroups: readonly string[],
  ): Promise<NotificationPreferences> {
    const unknown = mutedGroups.filter((key) => !isNotificationGroup(key));
    if (unknown.length > 0)
      throw new DomainError(
        "UNKNOWN_NOTIFICATION_GROUP",
        "Choose groups from the list.",
        { details: { groups: unknown } },
      );
    await this.deps.preferences.save(
      userId,
      [...new Set(mutedGroups)],
      this.now(),
    );
    return this.preferences(userId);
  }

  /** "Turn on notifications on this device": the browser's subscription. */
  subscribe(input: {
    userId: string;
    sessionId: string | null;
    endpoint: string;
    p256dh: string;
    auth: string;
    userAgent: string | null;
  }): Promise<{ id: string }> {
    return this.deps.subscriptions.save(input, this.now());
  }

  unsubscribe(userId: string, endpoint: string): Promise<void> {
    return this.deps.subscriptions.remove(userId, endpoint);
  }
}
