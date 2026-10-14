"use client";

import { useAuth } from "@repo/auth/react";
import { useSuspenseQuery } from "@tanstack/react-query";
import { Bell, CheckCheck } from "lucide-react";
import { useState, useTransition } from "react";
import { Button } from "@repo/ui/components/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@repo/ui/components/empty";

import { PageHeader } from "@/components/app-shell/page-header";
import { FormAlert } from "@/components/auth/form-alert";
import {
  notificationQueries,
  type NotificationsView,
} from "@/src/queries/notifications";

import { NotificationItem } from "./notification-item";
import { useNotificationActions } from "./use-notification-actions";

type Cursor = { after?: string; before?: string };

export function NotificationsScreen() {
  const { workspaceId, userId } = useAuth();
  const scope = `${workspaceId ?? ""}:${userId ?? ""}`;
  const [page, setPage] = useState<{ scope: string; cursor: Cursor } | null>(
    null,
  );
  const [paging, startPaging] = useTransition();
  const cursor = page?.scope === scope ? page.cursor : undefined;
  const { data } = useSuspenseQuery(notificationQueries.list(scope, cursor));
  return (
    <NotificationsContent
      view={data}
      paging={paging}
      onPage={(next) => {
        // A transition keeps this page on screen while the next one loads.
        startPaging(() => {
          setPage({ scope, cursor: next });
        });
      }}
    />
  );
}

export function NotificationsContent({
  view,
  paging = false,
  onPage,
}: {
  view: NotificationsView;
  paging?: boolean;
  onPage: (cursor: Cursor) => void;
}) {
  const { markRead, markAllRead } = useNotificationActions();
  const meta =
    view.unreadCount > 0
      ? `${String(view.unreadCount)} unread`
      : view.total > 0
        ? "All read"
        : undefined;

  return (
    <div className="w-full min-w-0 p-4 sm:p-6">
      <div className="max-w-4xl space-y-6">
        <PageHeader
          title="Notifications"
          meta={meta}
          actions={
            view.total > 0 ? (
              <Button
                type="button"
                variant="outline"
                disabled={view.unreadCount === 0 || markAllRead.isPending}
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
        <FormAlert
          message={
            markAllRead.isError
              ? "Couldn’t mark your Notifications read. Please try again."
              : undefined
          }
        />
        {view.items.length === 0 ? (
          <Empty className="rounded-2xl border">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Bell aria-hidden="true" />
              </EmptyMedia>
              <EmptyTitle>No Notifications yet</EmptyTitle>
              <EmptyDescription>
                When a Student or Parent gives or withdraws an Absence Notice
                for one of your Batches, you’ll see it here and get an email.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <ul
            aria-label="Notifications"
            aria-busy={paging}
            className="space-y-2"
          >
            {view.items.map((notification) => (
              <li key={notification.id}>
                <NotificationItem
                  notification={notification}
                  onOpen={(opened) => {
                    if (opened.readAt == null) markRead.mutate(opened.id);
                  }}
                />
              </li>
            ))}
          </ul>
        )}
        {view.prevCursor == null && view.nextCursor == null ? null : (
          <nav
            aria-label="Notification pages"
            className="flex justify-between gap-2"
          >
            <Button
              type="button"
              variant="outline"
              disabled={view.prevCursor == null || paging}
              onClick={() => {
                if (view.prevCursor != null)
                  onPage({ before: view.prevCursor });
              }}
            >
              Newer
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={view.nextCursor == null || paging}
              onClick={() => {
                if (view.nextCursor != null) onPage({ after: view.nextCursor });
              }}
            >
              Older
            </Button>
          </nav>
        )}
      </div>
    </div>
  );
}
