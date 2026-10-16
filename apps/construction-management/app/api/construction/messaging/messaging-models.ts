import { z } from "zod";

import type {
  NotificationPreferences,
  NotificationReadModel,
} from "@/src/messaging/application/notification-handlers";
import { NOTIFICATION_LIMITS } from "@/src/messaging/domain/notification";

export const MESSAGING_PATH = "/api/construction/messaging";
export const NOTIFICATIONS_PATH = `${MESSAGING_PATH}/notifications`;

const download = z.object({
  /** "PDF", "Excel", "ZIP". */
  label: z.string(),
  href: z.string(),
});

/** One notification in the member's list (CM-904). */
export const ConstructionMessagingNotificationResponseModel = z.object({
  id: z.uuid(),
  /** e.g. `task.assigned`, `approval.requested`, `report.ready`. */
  type: z.string(),
  /** The menu whose Notification flag allowed it; null for "ready". */
  menu: z.string().nullable(),
  /** The menu group (`MENU_CATEGORIES` key, or `downloads`). */
  group: z.string(),
  projectId: z.uuid().nullable(),
  title: z.string(),
  body: z.string().nullable(),
  /** A path inside the app the notification opens. */
  href: z.string().nullable(),
  /** A report, backup or export it carries, with its download links. */
  attachment: z
    .object({
      kind: z.enum(["report", "backup", "export"]),
      id: z.string(),
      downloads: z.array(download),
    })
    .nullable(),
  readAt: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
});

export type ConstructionMessagingNotificationResponseModel = z.infer<
  typeof ConstructionMessagingNotificationResponseModel
>;

export const ListConstructionMessagingNotificationsRequestModel = z.object({
  cursor: z.string().min(1).max(200).optional(),
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(NOTIFICATION_LIMITS.maxPage)
    .optional()
    .default(20),
});

export const ListConstructionMessagingNotificationsResponseModel = z.object({
  items: z.array(ConstructionMessagingNotificationResponseModel),
  nextCursor: z.string().nullable(),
});

export type ListConstructionMessagingNotificationsResponseModel = z.infer<
  typeof ListConstructionMessagingNotificationsResponseModel
>;

export const GetConstructionMessagingUnreadCountResponseModel = z.object({
  count: z.number().int().min(0),
  /**
   * The newest unread "ready" notification (report, backup, export) of
   * the last hour, for the Download toast; null when there is none.
   */
  latestReadyDownload:
    ConstructionMessagingNotificationResponseModel.nullable(),
});

export type GetConstructionMessagingUnreadCountResponseModel = z.infer<
  typeof GetConstructionMessagingUnreadCountResponseModel
>;

export const ConstructionMessagingNotificationParamsModel = z.object({
  id: z.uuid(),
});

export const MarkAllConstructionMessagingNotificationsReadResponseModel =
  z.object({ updated: z.number().int().min(0) });

export const CreateConstructionMessagingPushSubscriptionRequestModel = z.object(
  {
    endpoint: z.url().max(2000),
    keys: z.object({
      p256dh: z.string().min(1).max(500),
      auth: z.string().min(1).max(200),
    }),
  },
);

export const DeleteConstructionMessagingPushSubscriptionRequestModel = z.object(
  { endpoint: z.url().max(2000) },
);

export const ConstructionMessagingPushSubscriptionResponseModel = z.object({
  id: z.uuid(),
});

export const ConstructionMessagingPreferencesResponseModel = z.object({
  /** One switch per menu group: muted groups get no push. */
  groups: z.array(
    z.object({ key: z.string(), label: z.string(), muted: z.boolean() }),
  ),
});

export type ConstructionMessagingPreferencesResponseModel = z.infer<
  typeof ConstructionMessagingPreferencesResponseModel
>;

export const UpdateConstructionMessagingPreferencesRequestModel = z.object({
  mutedGroups: z.array(z.string().min(1).max(60)).max(20),
});

export const ConstructionMessagingPushConfigResponseModel = z.object({
  /** The VAPID public key; null when push is not set up on the server. */
  publicKey: z.string().nullable(),
});

export type ConstructionMessagingPushConfigResponseModel = z.infer<
  typeof ConstructionMessagingPushConfigResponseModel
>;

export function toNotificationResponse(
  notification: NotificationReadModel,
): ConstructionMessagingNotificationResponseModel {
  return {
    id: notification.id,
    type: notification.type,
    menu: notification.menu,
    group: notification.group,
    projectId: notification.projectId,
    title: notification.title,
    body: notification.body,
    href: notification.href,
    attachment: notification.attachment,
    readAt: notification.readAt?.toISOString() ?? null,
    createdAt: notification.createdAt.toISOString(),
  };
}

export function toPreferencesResponse(
  preferences: NotificationPreferences,
): ConstructionMessagingPreferencesResponseModel {
  return { groups: preferences.groups };
}
