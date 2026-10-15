"use client";

import { ImagePlus, Paperclip, X } from "lucide-react";
import { useCallback, useId, useRef, useState } from "react";
import { Button } from "@repo/ui/components/button";
import { Input } from "@repo/ui/components/input";
import { Label } from "@repo/ui/components/label";

import { FieldError } from "@/components/auth/field-error";
import { DocumentFileIcon } from "@/components/projects/documents/document-file-icon";
import { formatBytes } from "@/lib/project-documents";
import {
  TRACKING_ENTRY_FILES_MAX,
  checkTrackingFile,
  trackingFileAccept,
  trackingFileHint,
  trackingFileInputAccept,
} from "@/src/queries/tracking-documents";
import type { TrackingDocumentType } from "@/src/tracking/domain/tracking-documents";

import { trackingFileNoun, trackingFilesHeading } from "./tracking-file-parts";

export type TrackingPendingFilesFieldProps = {
  /** Which document the files will join: it decides photos only or PDFs too. */
  documentType: TrackingDocumentType;
  /** The files picked so far (form state; nothing is uploaded yet). */
  value: readonly File[];
  onChange: (files: File[]) => void;
  /** Photos only, whatever the document takes. */
  photosOnly?: boolean;
  /** "Photos" or "Files" unless given. */
  label?: string;
  disabled?: boolean;
  /** A form error to show under the field. */
  error?: string;
};

/**
 * Shows a picked image through an object URL that lives as long as its
 * `<img>`: made when the tile mounts, revoked when it unmounts — the tile
 * removed, the form saved or left — so no picked image stays in memory.
 */
function usePreviewRef(file: File) {
  return useCallback(
    (img: HTMLImageElement | null) => {
      if (img == null) return;
      const url = URL.createObjectURL(file);
      img.src = url;
      return () => {
        URL.revokeObjectURL(url);
      };
    },
    [file],
  );
}

function PendingTile({
  file,
  disabled,
  onRemove,
}: {
  file: File;
  disabled: boolean;
  onRemove: () => void;
}) {
  const preview = usePreviewRef(file);
  return (
    <li className="relative min-w-0">
      <span className="bg-muted text-muted-foreground flex aspect-square items-center justify-center overflow-hidden rounded-md border">
        {file.type.startsWith("image/") ? (
          // eslint-disable-next-line @next/next/no-img-element -- a local object URL, not a served image
          <img ref={preview} alt="" className="size-full object-cover" />
        ) : (
          <DocumentFileIcon
            fileName={file.name}
            contentType={file.type}
            className="size-1/3 max-h-10 max-w-10"
          />
        )}
      </span>
      <span className="mt-1.5 block truncate text-sm font-medium">
        {file.name}
      </span>
      <span className="text-muted-foreground block truncate text-xs">
        {formatBytes(file.size)}
      </span>
      <Button
        type="button"
        variant="secondary"
        size="icon-xs"
        aria-label={`Remove ${file.name}`}
        disabled={disabled}
        className="absolute top-1.5 right-1.5 shadow-sm"
        onClick={onRemove}
      >
        <X />
      </Button>
    </li>
  );
}

/**
 * Photos or files picked on a **new** task, issue or inspection form,
 * before the document has an id (CM-0019 §11). It only holds `File`s, with
 * thumbnails: nothing goes up until the form is saved, then
 * `useUploadPendingTrackingFiles(type)` uploads them to the new document.
 * Files the document would refuse (a PDF on a task, over 25 MB) are not
 * added, and say why. At most 10. Use it through react-hook-form's
 * `Controller`:
 *
 * ```tsx
 * <Controller control={form.control} name="files" render={({ field }) => (
 *   <TrackingPendingFilesField documentType="issue" value={field.value} onChange={field.onChange} />
 * )} />
 * ```
 *
 * On an existing document show `TrackingDocumentFiles` instead.
 */
export function TrackingPendingFilesField({
  documentType,
  value,
  onChange,
  photosOnly = false,
  label,
  disabled = false,
  error,
}: TrackingPendingFilesFieldProps) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const [refused, setRefused] = useState<string[]>([]);
  const accept = trackingFileAccept(documentType, photosOnly);
  const title = label ?? trackingFilesHeading(accept);
  const photos = accept === "images";
  const noun = trackingFileNoun(accept);
  const room = TRACKING_ENTRY_FILES_MAX - value.length;

  const pick = (picked: File[]) => {
    const problems: string[] = [];
    const accepted: File[] = [];
    for (const file of picked) {
      const problem = checkTrackingFile(accept, file);
      if (problem != null) problems.push(`${file.name}: ${problem.message}`);
      else if (accepted.length >= room)
        problems.push(
          `${file.name}: add at most ${String(TRACKING_ENTRY_FILES_MAX)} ${noun}s here.`,
        );
      else accepted.push(file);
    }
    setRefused(problems);
    if (accepted.length > 0) onChange([...value, ...accepted]);
  };

  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{title}</Label>
      {value.length > 0 ? (
        <ul
          aria-label={`${title} to upload`}
          className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-6"
        >
          {value.map((file, index) => (
            <PendingTile
              key={`${file.name}-${String(file.size)}-${String(file.lastModified)}-${String(index)}`}
              file={file}
              disabled={disabled}
              onRemove={() => {
                setRefused([]);
                onChange(value.filter((_, at) => at !== index));
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
        {trackingFileHint(accept)} They upload when you save.
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
    </div>
  );
}
