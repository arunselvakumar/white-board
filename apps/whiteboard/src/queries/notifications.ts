import { queryOptions } from "@tanstack/react-query";

import type {
  NotificationView,
  NotificationsView,
  UnreadNotificationsView,
} from "@/src/training-institute/application/absence-notice-views";

import { apiJson } from "./http";

export type {
  AbsenceNoticeNotificationPayload,
  NotificationKind,
  NotificationView,
  NotificationsView,
} from "@/src/training-institute/application/absence-notice-views";

const BASE = "/api/training-institute/notifications";
/** The bell re-checks for new Notifications this often. */
export const UNREAD_POLL_MS = 60_000;

function post<T>(path: string): Promise<T> {
  return apiJson<T>(`${BASE}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{}",
  });
}

export const notificationQueries = {
  key: { all: ["notifications"] as const },
  /** `sessionScope` keeps one User's cache from showing for another. */
  list: (sessionScope: string, cursor?: { after?: string; before?: string }) =>
    queryOptions({
      queryKey: [
        ...notificationQueries.key.all,
        "list",
        sessionScope,
        cursor?.after ?? null,
        cursor?.before ?? null,
      ] as const,
      queryFn: () => {
        const params = new URLSearchParams({ limit: "20" });
        if (cursor?.after) params.set("after", cursor.after);
        if (cursor?.before) params.set("before", cursor.before);
        return apiJson<NotificationsView>(`${BASE}?${params.toString()}`);
      },
    }),
  unread: (sessionScope: string) =>
    queryOptions({
      queryKey: [...notificationQueries.key.all, "unread", sessionScope],
      queryFn: () => apiJson<UnreadNotificationsView>(`${BASE}/unread-count`),
      refetchInterval: UNREAD_POLL_MS,
    }),
};

export function markNotificationRead(id: string): Promise<NotificationView> {
  return post(`/${id}/read`);
}

export function markAllNotificationsRead(): Promise<UnreadNotificationsView> {
  return post("/read-all");
}
