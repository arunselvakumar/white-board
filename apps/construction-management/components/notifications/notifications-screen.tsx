"use client";

import { useQuery, useSuspenseInfiniteQuery } from "@tanstack/react-query";
import { Bell, CheckCheck } from "lucide-react";
import { Button } from "@repo/ui/components/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@repo/ui/components/empty";

import { PageHeader } from "@/components/app-shell/page-header";

import { NotificationRow } from "./notification-item";
import {
  notificationsQuery,
  unreadCountQuery,
  useNotificationActions,
  type Notification,
} from "./notification-queries";

/**
 * Notifications (CM-904): the member's list in the Active Company, newest
 * first, with Load more, Mark read, Delete and Mark all read.
 */
export function NotificationsScreen() {
  const list = useSuspenseInfiniteQuery(notificationsQuery);
  const unread = useQuery({ ...unreadCountQuery, retry: false });
  const { markRead, markAllRead, remove } = useNotificationActions();
  const items = list.data.pages.flatMap((page) => page.items);
  const unreadCount =
    unread.data?.count ?? items.filter((item) => item.readAt == null).length;
  const busyId = markRead.isPending
    ? markRead.variables
    : remove.isPending
      ? remove.variables
      : undefined;

  const open = (notification: Notification) => {
    if (notification.readAt == null) markRead.mutate(notification.id);
  };

  return (
    <div className="w-full min-w-0 p-4 sm:p-6">
      <div className="w-full max-w-3xl space-y-6">
        <PageHeader
          title="Notifications"
          meta={
            unreadCount > 0
              ? `${String(unreadCount)} unread`
              : items.length > 0
                ? "All read"
                : undefined
          }
          actions={
            items.length > 0 ? (
              <Button
                type="button"
                variant="outline"
                disabled={unreadCount === 0 || markAllRead.isPending}
                onClick={() => {
                  markAllRead.mutate();
                }}
              >
                <CheckCheck aria-hidden="true" />
                {markAllRead.isPending ? "Marking…" : "Mark all read"}
              </Button>
            ) : null
          }
        />
        {markAllRead.isError || markRead.isError || remove.isError ? (
          <p role="alert" className="text-destructive text-sm">
            Couldn’t update your notifications. Please try again.
          </p>
        ) : null}
        {items.length === 0 ? (
          <Empty className="rounded-2xl border">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Bell aria-hidden="true" />
              </EmptyMedia>
              <EmptyTitle>No notifications yet</EmptyTitle>
              <EmptyDescription>
                Approvals, Tasks, Issues and the reports you ask for show up
                here.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <ul aria-label="Notifications" className="space-y-2">
            {items.map((notification) => (
              <li key={notification.id}>
                <NotificationRow
                  notification={notification}
                  busy={busyId === notification.id}
                  onOpen={open}
                  onDelete={(target) => {
                    remove.mutate(target.id);
                  }}
                />
              </li>
            ))}
          </ul>
        )}
        {list.hasNextPage ? (
          <div className="flex justify-center">
            <Button
              type="button"
              variant="outline"
              disabled={list.isFetchingNextPage}
              onClick={() => {
                void list.fetchNextPage();
              }}
            >
              {list.isFetchingNextPage ? "Loading…" : "Load more"}
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
