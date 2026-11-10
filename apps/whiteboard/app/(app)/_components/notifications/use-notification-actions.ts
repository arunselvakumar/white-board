"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";

import {
  markAllNotificationsRead,
  markNotificationRead,
  notificationQueries,
} from "@/src/queries/notifications";

/** Mark one or every Notification read, then refresh the bell and lists. */
export function useNotificationActions() {
  const queryClient = useQueryClient();
  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: notificationQueries.key.all });
  const markRead = useMutation({
    mutationFn: markNotificationRead,
    onSettled: refresh,
  });
  const markAllRead = useMutation({
    mutationFn: markAllNotificationsRead,
    onSettled: refresh,
  });
  return { markRead, markAllRead };
}
