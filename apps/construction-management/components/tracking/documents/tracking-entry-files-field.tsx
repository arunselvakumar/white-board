"use client";

import { ImagePlus, Paperclip } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { Button } from "@repo/ui/components/button";
import { Input } from "@repo/ui/components/input";
import { Label } from "@repo/ui/components/label";

import { FieldError } from "@/components/auth/field-error";
import { FileViewer } from "@/components/projects/files/file-viewer";
import {
  TRACKING_ENTRY_FILES_MAX,
  checkTrackingFile,
  trackingFileAccept,
  trackingFileHint,
  trackingFileInputAccept,
  type TrackingDocumentFile,
} from "@/src/queries/tracking-documents";
import type { TrackingDocumentType } from "@/src/tracking/domain/tracking-documents";

import {
  RemoveTrackingFileDialog,
  TrackingSavedFileTile,
  TrackingUploadingTile,
  trackingFileLine,
  trackingFileNoun,
  trackingFilesHeading,
  trackingViewable,
} from "./tracking-file-parts";
import { useTrackingFileUploads } from "./use-tracking-file-uploads";

export type TrackingEntryFilesFieldProps = {
  documentType: TrackingDocumentType;
  /** The existing task, issue or inspection the entry is posted on. */
  documentId: string;
  /** The uploaded files to post with the entry (form state). */
  value: readonly TrackingDocumentFile[];
  onChange: (files: TrackingDocumentFile[]) => void;
  /** Photos only, whatever the document takes (an issue update). */
  photosOnly?: boolean;
  /** "Photos" or "Files" unless given. */
  label?: string;
  disabled?: boolean;
  /** A form error to show under the field. */
  error?: string;
};

/**
 * Photos or files for a new **entry** on an existing document — a task's
 * progress update, an issue's update, an inspection's observation (CM-0019
 * §4, §7, §9). Picked files upload at once with progress (retry, cancel)
 * and join `value` when done; × removes an uploaded one from the document.
 * Post the entry with `value.map((file) => file.id)` (the server attaches
 * them with `attachEntryFiles`), then reset `value` to `[]`. At most 10.
 * Use it through react-hook-form's `Controller`:
 *
 * ```tsx
 * <Controller control={form.control} name="photos" render={({ field }) => (
 *   <TrackingEntryFilesField documentType="task" documentId={taskId}
 *     value={field.value} onChange={field.onChange} />
 * )} />
 * ```
 */
export function TrackingEntryFilesField({
  documentType,
  documentId,
  value,
  onChange,
  photosOnly = false,
  label,
  disabled = false,
  error,
}: TrackingEntryFilesFieldProps) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const accept = trackingFileAccept(documentType, photosOnly);
  const title = label ?? trackingFilesHeading(accept);
  const noun = trackingFileNoun(accept);
  const photos = accept === "images";
  const [refused, setRefused] = useState<string[]>([]);
  const [opened, setOpened] = useState<TrackingDocumentFile | null>(null);
  const [removing, setRemoving] = useState<TrackingDocumentFile | null>(null);
  // The latest value, for uploads that finish after a re-render. Each
  // change also writes it at once: two uploads can finish before the
  // parent re-renders, and the second must not drop the first.
  const latest = useRef(value);
  useEffect(() => {
    latest.current = value;
  }, [value]);
  const change = (next: TrackingDocumentFile[]) => {
    latest.current = next;
    onChange(next);
  };
  const { uploads, add, retry, dismiss, canRetry } = useTrackingFileUploads({
    documentType,
    documentId,
    accept,
    onUploaded: (file, item) => {
      change([...latest.current, file]);
      dismiss(item.id);
    },
  });
  const pending = uploads.filter((upload) => upload.state !== "done");
  const room = Math.max(
    0,
    TRACKING_ENTRY_FILES_MAX - value.length - pending.length,
  );

  const pick = (picked: File[]) => {
    const problems: string[] = [];
    const accepted: File[] = [];
    for (const file of picked) {
      const problem = checkTrackingFile(accept, file);
      if (problem != null) problems.push(`${file.name}: ${problem.message}`);
      else if (accepted.length >= room)
        problems.push(
          `${file.name}: post at most ${String(TRACKING_ENTRY_FILES_MAX)} ${noun}s at a time.`,
        );
      else accepted.push(file);
    }
    setRefused(problems);
    if (accepted.length > 0) add(accepted, {});
  };

  return (
    <div className="min-w-0 space-y-2">
      <Label htmlFor={id}>{title}</Label>
      {value.length > 0 || pending.length > 0 ? (
        <ul
          aria-label={`${title} to post`}
          className="grid grid-cols-3 gap-3 sm:grid-cols-4"
        >
          {value.map((file) => (
            <TrackingSavedFileTile
              key={file.id}
              file={file}
              onOpen={setOpened}
              {...(disabled ? {} : { onRemove: setRemoving })}
            />
          ))}
          {pending.map((upload) => (
            <TrackingUploadingTile
              key={upload.id}
              upload={upload}
              canRetry={canRetry(upload)}
              onRetry={() => {
                retry(upload.id);
              }}
              onDismiss={() => {
                dismiss(upload.id);
              }}
            />
          ))}
        </ul>
      ) : null}
      <div className="relative">
        <Input
          ref={input}
          id={id}
          type="file"
          multiple
          accept={trackingFileInputAccept(accept)}
          aria-label={`Choose ${noun}s for ${title}`}
          className="sr-only top-0 left-0"
          tabIndex={-1}
          disabled={disabled}
          onChange={(event) => {
            const picked = Array.from(event.target.files ?? []);
            event.target.value = "";
            if (picked.length > 0) pick(picked);
          }}
        />
        <Button
          type="button"
          variant="outline"
          disabled={disabled || room <= 0}
          onClick={() => input.current?.click()}
        >
          {photos ? (
            <ImagePlus aria-hidden="true" />
          ) : (
            <Paperclip aria-hidden="true" />
          )}
          {photos ? "Add photos" : "Add files"}
        </Button>
      </div>
      <p className="text-muted-foreground text-xs">
        {trackingFileHint(accept)} They upload now and post with it.
      </p>
      {refused.length > 0 ? (
        <ul aria-label="Not added" className="text-destructive text-xs">
          {refused.map((line) => (
            <li key={line} className="break-words">
              {line}
            </li>
          ))}
        </ul>
      ) : null}
      <FieldError message={error} />
      <FileViewer
        file={opened == null ? null : trackingViewable(opened)}
        description={opened == null ? undefined : trackingFileLine(opened)}
        onClose={() => {
          setOpened(null);
        }}
      />
      <RemoveTrackingFileDialog
        documentType={documentType}
        documentId={documentId}
        file={removing}
        onClose={() => {
          setRemoving(null);
        }}
        onRemoved={(fileId) => {
          change(latest.current.filter((file) => file.id !== fileId));
        }}
      />
    </div>
  );
}
