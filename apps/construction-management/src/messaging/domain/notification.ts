import {
  MENU_CATEGORIES,
  menuByKey,
  type MenuKey,
} from "@/src/shared-kernel/access";

/**
 * Notifications (ADR CM-0021 §6, §3): one row per recipient, written by
 * messaging's listeners from other modules' events. These are the rules
 * that do not need a database.
 */

export const NOTIFICATION_LIMITS = {
  /** Items in one page of the list. */
  maxPage: 50,
  /** The bell's dropdown. */
  dropdown: 10,
  titleMax: 140,
  bodyMax: 300,
} as const;

/** Kept 90 days, their delivery log a year (ADR CM-0021 §3). */
export const NOTIFICATION_RETENTION = {
  notificationDays: 90,
  deliveryDays: 365,
} as const;

/** A "ready" notification older than this does not raise the toast. */
export const READY_TOAST_WINDOW_MS = 60 * 60 * 1000;

const DAY_MS = 24 * 60 * 60 * 1000;

/** The delete-before instants for the daily retention job. */
export function retentionCutoffs(now: Date): {
  notificationsBefore: Date;
  deliveriesBefore: Date;
} {
  return {
    notificationsBefore: new Date(
      now.getTime() - NOTIFICATION_RETENTION.notificationDays * DAY_MS,
    ),
    deliveriesBefore: new Date(
      now.getTime() - NOTIFICATION_RETENTION.deliveryDays * DAY_MS,
    ),
  };
}

/**
 * Push can be muted per menu group: the Permission Matrix categories plus
 * "Reports and backups" for the ready notifications, which carry no menu.
 */
export const DOWNLOADS_GROUP = "downloads";

export const NOTIFICATION_GROUPS: readonly { key: string; label: string }[] = [
  ...MENU_CATEGORIES.map((category) => ({
    key: category.key,
    label: category.label,
  })),
  { key: DOWNLOADS_GROUP, label: "Reports and backups" },
];

const GROUP_KEYS = new Set(NOTIFICATION_GROUPS.map((group) => group.key));

export function isNotificationGroup(key: string): boolean {
  return GROUP_KEYS.has(key);
}

/** The group a notification's push is muted by: its menu's category. */
export function notificationGroup(menu: string | null): string {
  if (menu == null) return DOWNLOADS_GROUP;
  return menuByKey(menu)?.category ?? "others";
}

/** A download a "ready" notification carries (the toast's Download). */
export type NotificationAttachment = {
  kind: "report" | "backup" | "export";
  id: string;
  downloads: { label: string; href: string }[];
};

/** One notification as a listener drafts it, before it has recipients. */
export type NotificationDraft = {
  type: string;
  /** Null for "ready", which needs no Notification flag. */
  menu: MenuKey | null;
  projectId: string | null;
  title: string;
  body: string | null;
  /** A path inside the app. */
  href: string | null;
  attachment?: NotificationAttachment | null;
  /**
   * The event that raised it (e.g. `task.assigned:<taskId>:<eventTime>`):
   * a listener run twice for one event adds nothing.
   */
  sourceKey: string;
};

function clip(text: string, max: number): string {
  const trimmed = text.trim().replace(/\s+/g, " ");
  return trimmed.length <= max ? trimmed : `${trimmed.slice(0, max - 1)}…`;
}

/** Trims and clips the title and body to what the list and push show. */
export function normalizeDraft(draft: NotificationDraft): NotificationDraft {
  const body = draft.body == null ? null : clip(draft.body, 300);
  return {
    ...draft,
    title: clip(draft.title, NOTIFICATION_LIMITS.titleMax),
    body: body === "" ? null : body,
  };
}

/** What a push message carries to the service worker (`public/sw.js`). */
export type PushPayload = {
  title: string;
  body: string | null;
  href: string | null;
  /** Collapses repeats of one notification on a device. */
  tag: string;
};

export function pushPayload(notification: {
  id: string;
  title: string;
  body: string | null;
  href: string | null;
}): PushPayload {
  return {
    title: notification.title,
    body: notification.body,
    href: notification.href ?? "/app/notifications",
    tag: notification.id,
  };
}
