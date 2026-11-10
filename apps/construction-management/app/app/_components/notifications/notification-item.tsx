"use client";

import { Check, Download, Trash2 } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { Button, buttonVariants } from "@repo/ui/components/button";
import { cn } from "@repo/ui/lib/utils";

import { timeAgo } from "@/lib/notification-format";

import type { Notification } from "./notification-queries";

function itemName(notification: Notification): string {
  return notification.readAt == null
    ? `Unread: ${notification.title}`
    : notification.title;
}

function UnreadDot({ unread }: { unread: boolean }) {
  return (
    <span
      aria-hidden="true"
      className="flex w-2 shrink-0 justify-center pt-1.5"
    >
      {unread ? <span className="bg-primary size-2 rounded-full" /> : null}
    </span>
  );
}

function ItemText({ notification }: { notification: Notification }) {
  const unread = notification.readAt == null;
  return (
    <>
      <span
        className={cn(
          "block break-words",
          unread ? "font-semibold" : "font-medium",
        )}
      >
        {notification.title}
      </span>
      {notification.body == null ? null : (
        <span className="text-muted-foreground block break-words">
          {notification.body}
        </span>
      )}
      <time
        dateTime={notification.createdAt}
        className="text-muted-foreground block text-xs"
      >
        {timeAgo(notification.createdAt)}
      </time>
    </>
  );
}

/**
 * One notification in the bell: the whole row opens it. Opening marks it
 * read (the caller does that) and goes to its record.
 */
export function NotificationBellItem({
  notification,
  onOpen,
}: {
  notification: Notification;
  onOpen: (notification: Notification) => void;
}) {
  const unread = notification.readAt == null;
  const className = cn(
    "focus-visible:outline-ring hover:bg-muted/70 flex w-full gap-3 rounded-xl p-3 text-left text-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-2",
    unread && "bg-primary/5",
  );
  const content = (
    <>
      <UnreadDot unread={unread} />
      <span className="min-w-0 flex-1 space-y-1">
        <ItemText notification={notification} />
      </span>
    </>
  );
  if (notification.href == null)
    return (
      <Button
        type="button"
        variant="ghost"
        aria-label={itemName(notification)}
        className={cn(
          className,
          "h-auto items-start justify-start font-normal whitespace-normal",
        )}
        onClick={() => {
          onOpen(notification);
        }}
      >
        {content}
      </Button>
    );
  return (
    <Link
      href={notification.href}
      aria-label={itemName(notification)}
      className={className}
      onClick={() => {
        onOpen(notification);
      }}
    >
      {content}
    </Link>
  );
}

/** A report's, backup's or export's download links (Excel, PDF, ZIP). */
export function NotificationDownloads({
  notification,
  onDownload,
}: {
  notification: Notification;
  onDownload: (notification: Notification) => void;
}) {
  const downloads = notification.attachment?.downloads ?? [];
  if (downloads.length === 0) return null;
  return (
    <span className="flex flex-wrap gap-2">
      {downloads.map((download) => (
        <a
          key={download.href}
          href={download.href}
          download
          aria-label={`Download ${download.label}: ${notification.title}`}
          className={buttonVariants({ variant: "outline", size: "sm" })}
          onClick={() => {
            onDownload(notification);
          }}
        >
          <Download aria-hidden="true" />
          {download.label}
        </a>
      ))}
    </span>
  );
}

/**
 * One notification on the Notifications page: its title opens the record,
 * then its downloads, Mark read and Delete.
 */
export function NotificationRow({
  notification,
  busy,
  onOpen,
  onDelete,
}: {
  notification: Notification;
  /** True while a mark read or delete for this row is on its way. */
  busy: boolean;
  /** Marks it read (when unread); called on open, download and Mark read. */
  onOpen: (notification: Notification) => void;
  onDelete: (notification: Notification) => void;
}) {
  const unread = notification.readAt == null;
  const heading: ReactNode =
    notification.href == null ? (
      <span className="block space-y-1">
        {unread ? <span className="sr-only">Unread: </span> : null}
        <ItemText notification={notification} />
      </span>
    ) : (
      <Link
        href={notification.href}
        aria-label={itemName(notification)}
        className="focus-visible:outline-ring -m-1 block space-y-1 rounded-lg p-1 hover:underline focus-visible:outline-2"
        onClick={() => {
          onOpen(notification);
        }}
      >
        <ItemText notification={notification} />
      </Link>
    );

  return (
    <div
      data-unread={unread ? "" : undefined}
      className={cn(
        "bg-card flex gap-3 rounded-xl border p-3 text-sm",
        unread && "bg-primary/5",
      )}
    >
      <UnreadDot unread={unread} />
      <div className="min-w-0 flex-1 space-y-3">
        {heading}
        <NotificationDownloads
          notification={notification}
          onDownload={onOpen}
        />
        <div className="flex flex-wrap gap-2">
          {unread ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={busy}
              aria-label={`Mark read: ${notification.title}`}
              onClick={() => {
                onOpen(notification);
              }}
            >
              <Check aria-hidden="true" />
              Mark read
            </Button>
          ) : null}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={busy}
            aria-label={`Delete: ${notification.title}`}
            className="text-muted-foreground hover:text-destructive"
            onClick={() => {
              onDelete(notification);
            }}
          >
            <Trash2 aria-hidden="true" />
            Delete
          </Button>
        </div>
      </div>
    </div>
  );
}
