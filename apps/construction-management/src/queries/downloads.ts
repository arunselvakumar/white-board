import {
  infiniteQueryOptions,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";

import type {
  ConstructionReportingDownloadItemModel,
  ListConstructionReportingDownloadsResponseModel,
} from "@/app/api/construction/reporting/downloads/download-models";

import { apiJson } from "./http";
import { REPORTS_KEY } from "./reports";

export type DownloadItem = ConstructionReportingDownloadItemModel;
export type DownloadPage = ListConstructionReportingDownloadsResponseModel;

export const DOWNLOADS_API = "/api/construction/reporting/downloads";

/** Downloads' reads; Retry and Delete refresh it (and the report lists). */
export const DOWNLOADS_KEY = ["reporting", "downloads"] as const;

export const DOWNLOADS_PAGE_SIZE = 20;

export function isPreparingDownload(item: DownloadItem): boolean {
  return item.status === "queued" || item.status === "running";
}

/**
 * The member's own reports (later backups and exports) across Projects,
 * newest first, a page at a time. While one is queued or running the
 * pages poll every 3 seconds, as the Reports page does.
 */
export const downloadsQuery = infiniteQueryOptions({
  queryKey: [...DOWNLOADS_KEY, "list"] as const,
  initialPageParam: null as string | null,
  queryFn: ({ pageParam }) => {
    const query = new URLSearchParams({ limit: String(DOWNLOADS_PAGE_SIZE) });
    if (pageParam != null) query.set("cursor", pageParam);
    return apiJson<DownloadPage>(`${DOWNLOADS_API}?${query.toString()}`);
  },
  getNextPageParam: (last) => last.nextCursor,
  refetchInterval: (query) =>
    query.state.data?.pages.some((page) =>
      page.items.some(isPreparingDownload),
    ) === true
      ? 3_000
      : false,
});

function useRefresh() {
  const client = useQueryClient();
  return () =>
    Promise.all([
      client.invalidateQueries({ queryKey: DOWNLOADS_KEY }),
      client.invalidateQueries({ queryKey: REPORTS_KEY }),
    ]);
}

/** POSTs a row's `retryHref`: a failed one goes back on the queue. */
export function useRetryDownload() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: (item: DownloadItem) =>
      apiJson<unknown>(item.retryHref ?? "", { method: "POST" }),
    onSettled: refresh,
  });
}

/** POSTs a row's `deleteHref`: it and its files are deleted. */
export function useDeleteDownload() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: (item: DownloadItem) =>
      apiJson<null>(item.deleteHref ?? "", { method: "POST" }),
    onSettled: refresh,
  });
}
