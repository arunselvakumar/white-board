"use client";

import { CircleCheck, RotateCw, X } from "lucide-react";
import { Button } from "@repo/ui/components/button";
import { Progress } from "@repo/ui/components/progress";

import { formatBytes } from "@/lib/project-documents";

import { DocumentFileIcon } from "../documents/document-file-icon";
import type { DrawingUpload, DrawingUploads } from "./use-drawing-uploads";

/** One file going up: its progress, then Done or the reason it failed. */
export function DrawingUploadRow({
  upload,
  uploads,
}: {
  upload: DrawingUpload;
  uploads: DrawingUploads;
}) {
  const name = upload.file.name;
  const typed = "albumId" in upload.target ? upload.target.name : undefined;
  const status =
    upload.state === "done"
      ? "Done"
      : upload.state === "error"
        ? null
        : upload.progress >= 100
          ? "Saving…"
          : `${String(upload.progress)}%`;
  return (
    <li className="flex items-start gap-3 py-2.5">
      <span className="bg-muted text-muted-foreground flex size-8 shrink-0 items-center justify-center rounded-md">
        <DocumentFileIcon fileName={name} className="size-4" />
      </span>
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex items-baseline justify-between gap-2">
          <p className="truncate text-sm font-medium" title={name}>
            {name}
          </p>
          {status == null ? null : (
            <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
              {status}
            </span>
          )}
        </div>
        <p className="text-muted-foreground truncate text-xs">
          {typed == null ? "" : `${typed} · `}
          {formatBytes(upload.file.size)}
        </p>
        {upload.state === "uploading" ? (
          <Progress value={upload.progress} aria-label={`Uploading ${name}`} />
        ) : null}
        {upload.state === "error" ? (
          <p role="alert" className="text-destructive text-xs">
            {upload.error}
          </p>
        ) : null}
      </div>
      <div className="flex shrink-0 items-center">
        {upload.state === "done" ? (
          <CircleCheck
            aria-hidden="true"
            className="text-primary m-1.5 size-4"
          />
        ) : null}
        {uploads.canRetry(upload) ? (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={`Retry ${name}`}
            onClick={() => {
              uploads.retry(upload.id);
            }}
          >
            <RotateCw />
          </Button>
        ) : null}
        {upload.state === "done" ? null : (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={
              upload.state === "uploading"
                ? `Cancel upload of ${name}`
                : `Dismiss ${name}`
            }
            onClick={() => {
              uploads.dismiss(upload.id);
            }}
          >
            <X />
          </Button>
        )}
      </div>
    </li>
  );
}
