"use client";

import {
  FileArchive,
  FileSpreadsheet,
  FileText,
  RotateCw,
  Trash2,
} from "lucide-react";
import { Badge } from "@repo/ui/components/badge";
import { Button, buttonVariants } from "@repo/ui/components/button";
import { Spinner } from "@repo/ui/components/spinner";

import { EXPIRED_MESSAGE } from "@/components/reports/recent-reports";
import type { DownloadItem } from "@/src/queries/downloads";

/**
 * What each source is called on a row. CM-906 adds `backup` and `export`
 * here (a source without a label is a type error); everything else a row
 * shows is in the fields every source sends (`download-models.ts`).
 */
export const SOURCE_LABELS: Record<DownloadItem["source"], string> = {
  report: "Report",
  backup: "Backup",
  export: "Data export",
};

/** What an expired backup or export says (its link and file are gone). */
export const BACKUP_EXPIRED_MESSAGE = "Expired — make a new backup";

/** Where a row's contents come from, when it names no Project. */
function placeOf(item: DownloadItem): string {
  if (item.projectName != null) return item.projectName;
  if (item.source === "export") return "Your account";
  if (item.source === "backup" && item.scope === "masters")
    return "Master records";
  return item.projectId == null ? "All projects" : "A deleted Project";
}

const FILE_ICONS: Record<
  DownloadItem["files"][number]["format"],
  typeof FileText
> = {
  xlsx: FileSpreadsheet,
  pdf: FileText,
  zip: FileArchive,
};

const requestedAt = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

const keptUntil = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

export function DownloadStatus({ item }: { item: DownloadItem }) {
  switch (item.status) {
    case "done":
      return <Badge variant="secondary">Ready</Badge>;
    case "failed":
      return <Badge variant="destructive">Failed</Badge>;
    case "expired":
      return <Badge variant="outline">Expired</Badge>;
    default:
      return (
        <Badge variant="outline" className="gap-1">
          <Spinner aria-hidden="true" className="size-3" />
          Generating
        </Badge>
      );
  }
}

/**
 * One row of Downloads, whatever its source: title, status, what it
 * covers and where, then its files, Retry and Delete as the server offers
 * them (a link is there only when its route would allow it).
 */
export function DownloadRow({
  item,
  retrying,
  onRetry,
  onDelete,
}: {
  item: DownloadItem;
  retrying: boolean;
  onRetry: (item: DownloadItem) => void;
  onDelete: (item: DownloadItem) => void;
}) {
  const label = `${item.title} ${item.detail}`;
  const where = placeOf(item);
  return (
    <li className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium break-words">{item.title}</span>
          <DownloadStatus item={item} />
        </div>
        <p className="text-muted-foreground text-sm break-words">
          {SOURCE_LABELS[item.source]} · {item.detail} · {where}
        </p>
        <p className="text-muted-foreground text-xs">
          Requested {requestedAt.format(new Date(item.createdAt))}
          {item.status === "done" && item.expiresAt != null
            ? ` · kept until ${keptUntil.format(new Date(item.expiresAt))}`
            : ""}
        </p>
        {item.status === "failed" && item.error != null ? (
          <p className="text-destructive text-sm">{item.error}</p>
        ) : null}
        {item.status === "expired" ? (
          <p className="text-muted-foreground text-sm">
            {item.source === "report" ? EXPIRED_MESSAGE : BACKUP_EXPIRED_MESSAGE}
          </p>
        ) : null}
        {item.status === "done" &&
        item.files.length === 0 &&
        item.source === "report" ? (
          <p className="text-muted-foreground text-xs">
            You can no longer open this: it needs the Report flag (and Financial
            for amounts) that you no longer have.
          </p>
        ) : null}
      </div>
      <div className="flex flex-wrap gap-2">
        {item.files.map((file) => {
          const Icon = FILE_ICONS[file.format];
          return (
            <a
              key={file.href}
              href={file.href}
              download
              aria-label={`${label} ${file.label}`}
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              <Icon aria-hidden="true" />
              {file.label}
            </a>
          );
        })}
        {item.retryHref == null ? null : (
          <Button
            type="button"
            size="sm"
            variant="outline"
            aria-label={`Retry ${label}`}
            disabled={retrying}
            onClick={() => {
              onRetry(item);
            }}
          >
            {retrying ? (
              <Spinner aria-hidden="true" />
            ) : (
              <RotateCw aria-hidden="true" />
            )}
            Retry
          </Button>
        )}
        {item.deleteHref == null ? null : (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="text-destructive"
            aria-label={`Delete ${label}`}
            onClick={() => {
              onDelete(item);
            }}
          >
            <Trash2 aria-hidden="true" />
            Delete
          </Button>
        )}
      </div>
    </li>
  );
}
