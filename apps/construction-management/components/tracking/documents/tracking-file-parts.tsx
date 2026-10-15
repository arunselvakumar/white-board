"use client";

import { RotateCw, X } from "lucide-react";
import { useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@repo/ui/components/alert-dialog";
import { Button } from "@repo/ui/components/button";
import { Progress } from "@repo/ui/components/progress";
import { cn } from "@repo/ui/lib/utils";

import { FormAlert } from "@/components/auth/form-alert";
import { DocumentFileIcon } from "@/components/projects/documents/document-file-icon";
import { FileThumbnail } from "@/components/projects/files/file-thumbnail";
import { downloadUrl } from "@/components/projects/files/file-viewer";
import type { DirectUploadItem } from "@/components/uploads/use-direct-upload";
import { formatBytes } from "@/lib/project-documents";
import { uploadErrorMessage } from "@/src/queries/direct-upload";
import {
  useRemoveTrackingFile,
  type TrackingDocumentFile,
  type TrackingFileAccept,
} from "@/src/queries/tracking-documents";
import type { TrackingDocumentType } from "@/src/tracking/domain/tracking-documents";

/** A saved file as `FileThumbnail` and `FileViewer` take it. */
export function trackingViewable(file: TrackingDocumentFile) {
  return {
    name: file.fileName,
    url: file.url,
    contentType: file.contentType,
    thumbUrl: file.thumbUrl,
  };
}

/** Where opening a file goes: shown when the browser can, else downloaded. */
export function trackingOpenHref(file: TrackingDocumentFile): string {
  return file.viewable ? file.url : downloadUrl(file);
}

/** "420 KB · Karthik R" under a file. */
export function trackingFileLine(file: TrackingDocumentFile): string {
  return `${formatBytes(file.bytes)}${file.createdByName == null ? "" : ` · ${file.createdByName}`}`;
}

/** "Photos" for images only, "Files" when PDFs are taken too. */
export function trackingFilesHeading(accept: TrackingFileAccept): string {
  return accept === "images" ? "Photos" : "Files";
}

/** "photo" or "file". */
export function trackingFileNoun(accept: TrackingFileAccept): string {
  return accept === "images" ? "photo" : "file";
}

/**
 * One saved file as a square tile that opens it, with an optional ×.
 * `onOpen` is called for files the browser shows; others download.
 */
export function TrackingSavedFileTile({
  file,
  onOpen,
  onRemove,
  showName = true,
  className,
}: {
  file: TrackingDocumentFile;
  onOpen: (file: TrackingDocumentFile) => void;
  /** Shown when given: the × that asks to remove the file. */
  onRemove?: (file: TrackingDocumentFile) => void;
  showName?: boolean;
  /** Classes of the `<li>` (a strip's tile size). */
  className?: string;
}) {
  return (
    <li className={cn("relative min-w-0", className)}>
      <a
        href={trackingOpenHref(file)}
        target={file.viewable ? undefined : "_blank"}
        rel="noreferrer"
        aria-label={`Open ${file.fileName}`}
        className="group focus-visible:ring-ring/50 block min-w-0 rounded-lg focus-visible:ring-3 focus-visible:outline-none"
        onClick={(event) => {
          if (!file.viewable) return;
          event.preventDefault();
          onOpen(file);
        }}
      >
        <FileThumbnail
          file={trackingViewable(file)}
          className="w-full border group-hover:opacity-90"
        />
        {showName ? (
          <>
            <span className="mt-1.5 block truncate text-sm font-medium">
              {file.fileName}
            </span>
            <span className="text-muted-foreground block truncate text-xs">
              {trackingFileLine(file)}
            </span>
          </>
        ) : null}
      </a>
      {onRemove == null ? null : (
        <Button
          type="button"
          variant="secondary"
          size="icon-xs"
          aria-label={`Remove ${file.fileName}`}
          className="absolute top-1.5 right-1.5 shadow-sm"
          onClick={() => {
            onRemove(file);
          }}
        >
          <X />
        </Button>
      )}
    </li>
  );
}

/** A file going up: its icon, name, progress or error, retry and cancel. */
export function TrackingUploadingTile({
  upload,
  canRetry,
  onRetry,
  onDismiss,
}: {
  upload: DirectUploadItem<object>;
  canRetry: boolean;
  onRetry: () => void;
  onDismiss: () => void;
}) {
  return (
    <li className="min-w-0" aria-label={`Uploading ${upload.file.name}`}>
      <span className="bg-muted text-muted-foreground flex aspect-square items-center justify-center rounded-md border">
        <DocumentFileIcon
          fileName={upload.file.name}
          contentType={upload.file.type}
          className="size-1/3 max-h-10 max-w-10"
        />
      </span>
      <span className="mt-1.5 block truncate text-sm font-medium">
        {upload.file.name}
      </span>
      {upload.state === "error" ? (
        <span className="text-destructive block text-xs">{upload.error}</span>
      ) : (
        <Progress
          value={upload.progress}
          aria-label={`${upload.file.name} upload`}
          className="mt-1"
        />
      )}
      <span className="mt-1 flex gap-1">
        {canRetry ? (
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            aria-label={`Retry ${upload.file.name}`}
            onClick={onRetry}
          >
            <RotateCw />
          </Button>
        ) : null}
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          aria-label={
            upload.state === "error"
              ? `Dismiss ${upload.file.name}`
              : `Cancel upload of ${upload.file.name}`
          }
          onClick={onDismiss}
        >
          <X />
        </Button>
      </span>
    </li>
  );
}

/**
 * "Remove {file}?" before a document's file goes for everyone. Closes on
 * success (and calls `onRemoved`); a failure stays in the dialog with the
 * server's message.
 */
export function RemoveTrackingFileDialog({
  documentType,
  documentId,
  file,
  onClose,
  onRemoved,
}: {
  documentType: TrackingDocumentType;
  documentId: string;
  /** The file to remove; null keeps the dialog closed. */
  file: Pick<TrackingDocumentFile, "id" | "fileName"> | null;
  onClose: () => void;
  onRemoved?: (fileId: string) => void;
}) {
  const removal = useRemoveTrackingFile(documentType, documentId);
  // Keep the name on screen while the dialog animates closed.
  const [last, setLast] = useState(file);
  if (file != null && file !== last) setLast(file);
  const shown = file ?? last;
  return (
    <AlertDialog
      open={file != null}
      onOpenChange={(open) => {
        if (!open) {
          removal.reset();
          onClose();
        }
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="break-all">
            Remove {shown?.fileName}?
          </AlertDialogTitle>
          <AlertDialogDescription>
            It&apos;s removed for everyone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        {removal.isError ? (
          <FormAlert
            message={uploadErrorMessage(
              removal.error,
              "Couldn't remove. Try again.",
            )}
          />
        ) : null}
        <AlertDialogFooter>
          <AlertDialogCancel>Keep it</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={removal.isPending}
            onClick={() => {
              if (file == null) return;
              removal.mutate(file.id, {
                onSuccess: () => {
                  removal.reset();
                  onRemoved?.(file.id);
                  onClose();
                },
              });
            }}
          >
            Remove
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
