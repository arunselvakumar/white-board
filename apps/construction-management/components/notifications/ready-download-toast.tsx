"use client";

import { useCompanyAuth } from "@repo/auth/construction/react";
import {
  useQuery,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { createToastManager, Toaster } from "@repo/ui/components/toast";

import { REPORTS_KEY } from "@/src/queries/reports";

import {
  FAST_POLL_MS,
  firstDownload,
  UNREAD_POLL_MS,
  unreadCountQuery,
  useNotificationActions,
} from "./notification-queries";

/** Ready notifications already toasted in this tab. */
const SHOWN_KEY = "construction.notifications.ready-shown";
const SHOWN_LIMIT = 50;
/** A queued report seen longer ago than this stops the fast poll. */
const FAST_POLL_WINDOW_MS = 2 * 60_000;
/** How long the Download toast stays up. */
const TOAST_MS = 30_000;

function readShown(): string[] {
  try {
    const raw = window.sessionStorage.getItem(SHOWN_KEY);
    const parsed: unknown = raw == null ? [] : JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((id): id is string => typeof id === "string")
      : [];
  } catch {
    return [];
  }
}

function rememberShown(id: string): void {
  try {
    const shown = [...readShown().filter((seen) => seen !== id), id];
    window.sessionStorage.setItem(
      SHOWN_KEY,
      JSON.stringify(shown.slice(-SHOWN_LIMIT)),
    );
  } catch {
    // Storage can be off (private window); the toast may then repeat.
  }
}

type JobList = { items?: { status?: string }[] };

/**
 * True while a cached reports list (Project or central) holds a queued or
 * running report, fetched within `windowMs` when given.
 */
export function hasPendingReport(
  client: QueryClient,
  windowMs?: number,
): boolean {
  const now = Date.now();
  return client
    .getQueryCache()
    .findAll({ queryKey: REPORTS_KEY })
    .some((query) => {
      if (windowMs != null && now - query.state.dataUpdatedAt > windowMs)
        return false;
      const data = query.state.data as JobList | undefined;
      return (
        data?.items?.some(
          (job) => job.status === "queued" || job.status === "running",
        ) === true
      );
    });
}

/** Starts a file download without leaving the page. */
export function startDownload(href: string): void {
  const link = document.createElement("a");
  link.href = href;
  link.download = "";
  link.rel = "noopener";
  document.body.append(link);
  link.click();
  link.remove();
}

/**
 * The in-app popup (CM-0021 §6): when a report, backup or export the member
 * asked for is ready, a toast offers its download. It rides the unread-count
 * poll, every 30 seconds, and every 3 seconds while a report is running.
 * Each ready notification toasts once per tab.
 */
export function ReadyDownloadToast({
  download = startDownload,
}: {
  /** Starts the download; stories pass a spy. */
  download?: (href: string) => void;
}) {
  const client = useQueryClient();
  const { workspaceId } = useCompanyAuth();
  const [toasts] = useState(() => createToastManager());
  const { markRead } = useNotificationActions();
  const markReadNow = markRead.mutate;

  const subscribe = useCallback(
    (onChange: () => void) => client.getQueryCache().subscribe(onChange),
    [client],
  );
  const running = useSyncExternalStore(
    subscribe,
    () => hasPendingReport(client),
    () => false,
  );
  const { data, refetch } = useQuery({
    ...unreadCountQuery,
    enabled: workspaceId != null,
    retry: false,
    refetchInterval: () =>
      hasPendingReport(client, FAST_POLL_WINDOW_MS)
        ? FAST_POLL_MS
        : UNREAD_POLL_MS,
  });

  // A report just finished: look for its notification now, not in 30 s.
  const wasRunning = useRef(false);
  useEffect(() => {
    if (wasRunning.current && !running) void refetch();
    wasRunning.current = running;
  }, [running, refetch]);

  const ready = data?.latestReadyDownload ?? null;
  useEffect(() => {
    if (ready == null || readShown().includes(ready.id)) return;
    rememberShown(ready.id);
    const file = firstDownload(ready);
    const id = toasts.add({
      title: ready.title,
      ...(ready.body == null ? {} : { description: ready.body }),
      timeout: TOAST_MS,
      ...(file == null
        ? {}
        : {
            actionProps: {
              children: "Download",
              onClick: () => {
                markReadNow(ready.id);
                download(file.href);
                toasts.close(id);
              },
            },
          }),
    });
  }, [ready, toasts, download, markReadNow]);

  return <Toaster toastManager={toasts} />;
}
