"use client";

import { useCompanyAuth } from "@repo/auth/construction/react";
import { useQuery } from "@tanstack/react-query";
import { Bell, CheckCheck } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Button, buttonVariants } from "@repo/ui/components/button";
import {
  Popover,
  PopoverContent,
  PopoverTitle,
  PopoverTrigger,
} from "@repo/ui/components/popover";

import { bellLabel, unreadBadge } from "@/lib/notification-format";

import { NotificationBellItem } from "./notification-item";
import {
  latestNotificationsQuery,
  unreadCountQuery,
  useNotificationActions,
} from "./notification-queries";
import { BellListSkeleton } from "./notifications-skeletons";

export const NOTIFICATIONS_PAGE = "/app/notifications";

/**
 * The bell in the top bar (CM-904): the unread count, polled in the
 * background, and a popover of the latest ten. It never suspends; a failed
 * read shows a bell with no count rather than breaking the header.
 */
export function NotificationBell() {
  const { workspaceId } = useCompanyAuth();
  const [open, setOpen] = useState(false);
  const unread = useQuery({
    ...unreadCountQuery,
    enabled: workspaceId != null,
    retry: false,
  });
  const count = unread.data?.count ?? 0;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            variant="ghost"
            size="icon"
            className="relative size-9 rounded-full"
            aria-label={bellLabel(count)}
          />
        }
      >
        <Bell aria-hidden="true" className="size-5" />
        {count > 0 ? (
          <span
            aria-hidden="true"
            data-testid="notification-badge"
            className="bg-destructive ring-card absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] leading-none font-semibold text-white tabular-nums ring-2"
          >
            {unreadBadge(count)}
          </span>
        ) : null}
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-[min(24rem,calc(100vw-2rem))] gap-0 p-0"
      >
        {open ? (
          <BellPanel
            unreadCount={count}
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
  unreadCount,
  onClose,
}: {
  unreadCount: number;
  onClose: () => void;
}) {
  // staleTime 0: every opening shows the cached list, then refreshes it.
  const list = useQuery({
    ...latestNotificationsQuery,
    staleTime: 0,
    retry: false,
  });
  const { markRead, markAllRead } = useNotificationActions();
  const items = list.data?.items ?? [];

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
          <BellListSkeleton />
        ) : list.isError ? (
          <p role="alert" className="text-destructive p-3 text-sm">
            Couldn’t load notifications. Please try again.
          </p>
        ) : items.length === 0 ? (
          <p className="text-muted-foreground p-3 text-sm">
            No notifications yet
          </p>
        ) : (
          <ul aria-label="Latest notifications" className="space-y-1">
            {items.map((notification) => (
              <li key={notification.id}>
                <NotificationBellItem
                  notification={notification}
                  onOpen={(opened) => {
                    if (opened.readAt == null) markRead.mutate(opened.id);
                    if (opened.href != null) onClose();
                  }}
                />
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="border-t p-1.5">
        <Link
          href={NOTIFICATIONS_PAGE}
          className={buttonVariants({
            variant: "ghost",
            size: "sm",
            className: "w-full",
          })}
          onClick={onClose}
        >
          See all
        </Link>
      </div>
    </>
  );
}
