import {
  infiniteQueryOptions,
  queryOptions,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";

import type {
  ConstructionMessagingNotificationResponseModel,
  ConstructionMessagingPreferencesResponseModel,
  ConstructionMessagingPushConfigResponseModel,
  GetConstructionMessagingUnreadCountResponseModel,
  ListConstructionMessagingNotificationsResponseModel,
} from "@/app/api/construction/messaging/messaging-models";
import { apiJson } from "@/src/queries/http";

export type Notification = ConstructionMessagingNotificationResponseModel;
export type NotificationPage =
  ListConstructionMessagingNotificationsResponseModel;
export type UnreadCount = GetConstructionMessagingUnreadCountResponseModel;
export type NotificationPreferences =
  ConstructionMessagingPreferencesResponseModel;
export type PushConfig = ConstructionMessagingPushConfigResponseModel;

/** `PushSubscription.toJSON()` as the server stores it. */
export type PushSubscriptionInput = {
  endpoint: string;
  keys: { p256dh: string; auth: string };
};

export const MESSAGING_API = "/api/construction/messaging";
export const NOTIFICATIONS_API = `${MESSAGING_API}/notifications`;

/** The bell re-checks the unread count this often (CM-0021 §6). */
export const UNREAD_POLL_MS = 30_000;
/** …and this often while the member has a report running. */
export const FAST_POLL_MS = 3_000;
/** How many the bell lists before "See all". */
export const BELL_ITEMS = 10;
/** One "Load more" page on the Notifications page. */
export const PAGE_SIZE = 20;

/** Every notification query key starts here. */
export const NOTIFICATIONS_KEY = ["messaging", "notifications"] as const;

export const notificationKeys = {
  all: NOTIFICATIONS_KEY,
  latest: [...NOTIFICATIONS_KEY, "latest"] as const,
  list: [...NOTIFICATIONS_KEY, "list"] as const,
  unread: [...NOTIFICATIONS_KEY, "unread-count"] as const,
  preferences: ["messaging", "preferences"] as const,
  pushConfig: ["messaging", "push-config"] as const,
};

function listUrl(limit: number, cursor: string | null): string {
  const params = new URLSearchParams({ limit: String(limit) });
  if (cursor != null) params.set("cursor", cursor);
  return `${NOTIFICATIONS_API}?${params.toString()}`;
}

/** The bell's latest ten, newest first. */
export const latestNotificationsQuery = queryOptions({
  queryKey: notificationKeys.latest,
  queryFn: () => apiJson<NotificationPage>(listUrl(BELL_ITEMS, null)),
});

/** The Notifications page, a page at a time ("Load more"). */
export const notificationsQuery = infiniteQueryOptions({
  queryKey: notificationKeys.list,
  initialPageParam: null as string | null,
  queryFn: ({ pageParam }) =>
    apiJson<NotificationPage>(listUrl(PAGE_SIZE, pageParam)),
  getNextPageParam: (last) => last.nextCursor,
});

/** The unread count and the newest unread download, polled for the bell. */
export const unreadCountQuery = queryOptions({
  queryKey: notificationKeys.unread,
  queryFn: () => apiJson<UnreadCount>(`${NOTIFICATIONS_API}/unread-count`),
  refetchInterval: UNREAD_POLL_MS,
});

/** One switch per menu group: muted groups get no push. */
export const notificationPreferencesQuery = queryOptions({
  queryKey: notificationKeys.preferences,
  queryFn: () =>
    apiJson<NotificationPreferences>(`${MESSAGING_API}/preferences`),
});

/** The server's VAPID public key; null when push is not set up. */
export const pushConfigQuery = queryOptions({
  queryKey: notificationKeys.pushConfig,
  queryFn: () => apiJson<PushConfig>(`${MESSAGING_API}/push/config`),
  staleTime: Infinity,
});

function post<T>(path: string, body?: unknown): Promise<T> {
  return apiJson<T>(
    `${MESSAGING_API}${path}`,
    body === undefined
      ? { method: "POST" }
      : {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        },
  );
}

export function markNotificationRead(id: string): Promise<Notification> {
  return post(`/notifications/${id}/read`);
}

export function markAllNotificationsRead(): Promise<{ updated: number }> {
  return post("/notifications/read-all");
}

export function deleteNotification(id: string): Promise<void> {
  return post(`/notifications/${id}/delete`);
}

export function savePushSubscription(
  subscription: PushSubscriptionInput,
): Promise<{ id: string }> {
  return post("/push-subscriptions", subscription);
}

export function deletePushSubscription(endpoint: string): Promise<void> {
  return post("/push-subscriptions/delete", { endpoint });
}

export function updateNotificationPreferences(
  mutedGroups: string[],
): Promise<NotificationPreferences> {
  return post("/preferences/update", { mutedGroups });
}

/**
 * Mark read, mark all read and delete. Each refreshes the bell, its count
 * and the Notifications page.
 */
export function useNotificationActions() {
  const client = useQueryClient();
  const refresh = () =>
    client.invalidateQueries({ queryKey: notificationKeys.all });
  const markRead = useMutation({
    mutationFn: markNotificationRead,
    onSettled: refresh,
  });
  const markAllRead = useMutation({
    mutationFn: markAllNotificationsRead,
    onSettled: refresh,
  });
  const remove = useMutation({
    mutationFn: deleteNotification,
    onSettled: refresh,
  });
  return { markRead, markAllRead, remove };
}

/** Saves the full list of muted menu groups. */
export function useUpdateNotificationPreferences() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: updateNotificationPreferences,
    onSuccess: (preferences) => {
      client.setQueryData(notificationKeys.preferences, preferences);
    },
  });
}

/** The first download link of a "ready" notification, if it has one. */
export function firstDownload(
  notification: Notification,
): { label: string; href: string } | null {
  return notification.attachment?.downloads[0] ?? null;
}
