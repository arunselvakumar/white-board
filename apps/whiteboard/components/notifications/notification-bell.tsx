"use client";

import { useAuth } from "@repo/auth/react";
import { useQuery } from "@tanstack/react-query";
import { Bell, CheckCheck } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Button } from "@repo/ui/components/button";
import {
  Popover,
  PopoverContent,
  PopoverTitle,
  PopoverTrigger,
} from "@repo/ui/components/popover";

import { notificationQueries } from "@/src/queries/notifications";

import { NotificationItem } from "./notification-item";
import { useNotificationActions } from "./use-notification-actions";

/** Notifications the bell lists before "See all". */
const BELL_ITEMS = 5;

export function bellLabel(unreadCount: number): string {
  return unreadCount > 0
    ? `Notifications, ${String(unreadCount)} unread`
    : "Notifications";
}

/**
 * The bell in the app shell header (ADR-0041 §1). It never suspends: the
 * unread count is polled in the background, and a failed read shows a bell
 * with no count rather than breaking the header.
 */
export function NotificationBell() {
  const { workspaceId, userId } = useAuth();
  const scope = `${workspaceId ?? ""}:${userId ?? ""}`;
  const [open, setOpen] = useState(false);
  const unread = useQuery(notificationQueries.unread(scope));
  const unreadCount = unread.data?.unreadCount ?? 0;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            variant="ghost"
            size="icon"
            className="relative rounded-full"
            aria-label={bellLabel(unreadCount)}
          />
        }
      >
        <Bell aria-hidden="true" />
        {unreadCount > 0 ? (
          <span
            aria-hidden="true"
            className="bg-destructive ring-card absolute top-0.5 right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] leading-none font-semibold text-white tabular-nums ring-2"
          >
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        ) : null}
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-[min(24rem,calc(100vw-2rem))] gap-0 p-0"
      >
        {open ? (
          <BellPanel
            scope={scope}
            unreadCount={unreadCount}
            onClose={() => {
              setOpen(false);
            }}
          />
        ) : null}
      </PopoverContent>
    </Popover>
  );
}

function BellPanel({
  scope,
  unreadCount,
  onClose,
}: {
  scope: string;
  unreadCount: number;
  onClose: () => void;
}) {
  const list = useQuery(notificationQueries.list(scope));
  const { markRead, markAllRead } = useNotificationActions();
  const items = list.data?.items.slice(0, BELL_ITEMS) ?? [];

  return (
    <>
      <div className="flex items-center justify-between gap-2 border-b px-3 py-2">
        <PopoverTitle className="text-sm font-semibold">
          Notifications
        </PopoverTitle>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={unreadCount === 0 || markAllRead.isPending}
          onClick={() => {
            markAllRead.mutate();
          }}
        >
          <CheckCheck aria-hidden="true" />
          Mark all read
        </Button>
      </div>
      <div className="max-h-[min(28rem,60svh)] overflow-y-auto p-1.5">
        {list.isPending ? (
          <p className="text-muted-foreground p-3 text-sm">
            Loading Notifications…
          </p>
        ) : list.isError ? (
          <p role="alert" className="text-destructive p-3 text-sm">
            Couldn’t load Notifications. Please try again.
          </p>
        ) : items.length === 0 ? (
          <p className="text-muted-foreground p-3 text-sm">
            No Notifications yet.
          </p>
        ) : (
          <ul aria-label="Latest Notifications" className="space-y-1">
            {items.map((notification) => (
              <li key={notification.id}>
                <NotificationItem
                  notification={notification}
                  compact
                  onOpen={(opened) => {
                    if (opened.readAt == null) markRead.mutate(opened.id);
                    onClose();
                  }}
                />
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="border-t p-1.5">
        <Button
          variant="ghost"
          size="sm"
          className="w-full"
          render={<Link href="/notifications" />}
          onClick={onClose}
        >
          See all Notifications
        </Button>
      </div>
    </>
  );
}
