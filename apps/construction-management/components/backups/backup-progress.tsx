"use client";

import { useQuery } from "@tanstack/react-query";
import { CircleCheck, FileArchive, TriangleAlert } from "lucide-react";
import { buttonVariants } from "@repo/ui/components/button";
import { Progress } from "@repo/ui/components/progress";
import { Spinner } from "@repo/ui/components/spinner";

import {
  backupQueries,
  formatBytes,
  isPreparingBackup,
  type Backup,
} from "@/src/queries/backups";

const until = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

/**
 * Where a requested backup stands (CM-906): being made (modules done of
 * all), ready with its Download, or failed with the reason. It polls
 * every 3 seconds until it is done; it is also in Downloads, and a
 * notification says when it is ready.
 */
export function BackupProgress({
  backupId,
  initial,
}: {
  backupId: string;
  initial?: Backup;
}) {
  const { data } = useQuery({
    ...backupQueries.one(backupId),
    ...(initial == null ? {} : { initialData: initial }),
  });
  if (data == null)
    return (
      <p className="text-muted-foreground flex items-center gap-2 text-sm">
        <Spinner aria-hidden="true" /> Loading…
      </p>
    );
  const mine = data.scope === "my_data";
  if (isPreparingBackup(data)) {
    const percent =
      data.partsTotal === 0
        ? 0
        : Math.round((data.partsDone / data.partsTotal) * 100);
    return (
      <div role="status" className="min-w-0 space-y-2">
        <p className="flex items-center gap-2 text-sm font-medium">
          <Spinner aria-hidden="true" />
          {mine ? "Preparing your data…" : "Making your backup…"}{" "}
          {data.partsDone} of {data.partsTotal}{" "}
          {data.partsTotal === 1 ? "part" : "parts"}
        </p>
        <Progress value={percent} aria-label="Backup progress" />
        <p className="text-muted-foreground text-sm">
          You can close this. We will tell you when it is ready, and it stays in
          Downloads.
        </p>
      </div>
    );
  }
  if (data.status === "done" && data.downloadHref != null) {
    const size = formatBytes(data.bytes);
    return (
      <div role="status" className="min-w-0 space-y-3">
        <p className="flex items-center gap-2 text-sm font-medium">
          <CircleCheck aria-hidden="true" className="size-4 text-emerald-600" />
          {mine ? "Your data is ready" : "Your backup is ready"}
          {size == null ? "" : ` (${size})`}
        </p>
        <a
          href={data.downloadHref}
          download
          className={buttonVariants({ variant: "default" })}
        >
          <FileArchive aria-hidden="true" />
          Download ZIP
        </a>
        {data.expiresAt == null ? null : (
          <p className="text-muted-foreground text-sm">
            The link works until {until.format(new Date(data.expiresAt))}, for
            you only. It is also in Downloads.
          </p>
        )}
      </div>
    );
  }
  return (
    <div role="alert" className="min-w-0 space-y-1">
      <p className="text-destructive flex items-center gap-2 text-sm font-medium">
        <TriangleAlert aria-hidden="true" className="size-4" />
        {data.status === "expired"
          ? "This backup has expired."
          : "The backup could not be made."}
      </p>
      {data.error == null ? null : (
        <p className="text-destructive text-sm break-words">{data.error}</p>
      )}
    </div>
  );
}
