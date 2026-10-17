"use client";

import { useQueryClient } from "@tanstack/react-query";
import { FileText, ImagePlus, X } from "lucide-react";
import { useCallback, useId, useRef, useState } from "react";
import { Button } from "@repo/ui/components/button";
import { Input } from "@repo/ui/components/input";
import { Label } from "@repo/ui/components/label";

import { formatBytes } from "@/lib/project-documents";
import {
  bookingFileAccept,
  bookingFilesKey,
  checkBookingFile,
  uploadBookingFile,
} from "@/src/queries/sales-bookings";

/** Files picked on a new booking: one Booking Form and photos. */
export type PendingBookingFiles = { bookingForm: File | null; photos: File[] };

export const NO_PENDING_BOOKING_FILES: PendingBookingFiles = {
  bookingForm: null,
  photos: [],
};

/** At most this many photos picked on the form (more on the booking's page). */
const PHOTOS_MAX = 10;

function FileRow({
  file,
  disabled,
  onRemove,
}: {
  file: File;
  disabled: boolean;
  onRemove: () => void;
}) {
  return (
    <li className="flex min-w-0 items-center gap-2 rounded-md border px-2 py-1.5 text-sm">
      <FileText
        aria-hidden="true"
        className="text-muted-foreground size-4 shrink-0"
      />
      <span className="min-w-0 flex-1 truncate">{file.name}</span>
      <span className="text-muted-foreground shrink-0 text-xs">
        {formatBytes(file.size)}
      </span>
      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        aria-label={`Remove ${file.name}`}
        disabled={disabled}
        onClick={onRemove}
      >
        <X />
      </Button>
    </li>
  );
}

/**
 * The **Booking Form** (one PDF or photo) and **photos** picked on a new
 * booking (CM-0022 §7), before it has an id: nothing goes up until the
 * form is saved, then `useUploadPendingBookingFiles()` sends them to the
 * new booking. Files the booking would refuse (a PDF as a photo, over
 * 25 MB) are not added, and say why. Sales files are personal data: they
 * never join the Project Gallery.
 */
export function BookingFilesField({
  value,
  onChange,
  disabled = false,
}: {
  value: PendingBookingFiles;
  onChange: (value: PendingBookingFiles) => void;
  disabled?: boolean;
}) {
  const formId = useId();
  const photosId = useId();
  const formInput = useRef<HTMLInputElement>(null);
  const photosInput = useRef<HTMLInputElement>(null);
  const [refused, setRefused] = useState<string[]>([]);

  const pickForm = (file: File | undefined) => {
    if (file == null) return;
    const problem = checkBookingFile("booking_form", file);
    setRefused(problem == null ? [] : [`${file.name}: ${problem}`]);
    if (problem == null) onChange({ ...value, bookingForm: file });
  };
  const pickPhotos = (files: File[]) => {
    const problems: string[] = [];
    const accepted: File[] = [];
    for (const file of files) {
      const problem = checkBookingFile("photo", file);
      if (problem != null) problems.push(`${file.name}: ${problem}`);
      else if (value.photos.length + accepted.length >= PHOTOS_MAX)
        problems.push(
          `${file.name}: add at most ${String(PHOTOS_MAX)} photos here; add more on the booking's page.`,
        );
      else accepted.push(file);
    }
    setRefused(problems);
    if (accepted.length > 0)
      onChange({ ...value, photos: [...value.photos, ...accepted] });
  };

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="min-w-0 space-y-2">
        <Label htmlFor={formId}>Booking Form</Label>
        {value.bookingForm != null ? (
          <ul aria-label="Booking Form to upload">
            <FileRow
              file={value.bookingForm}
              disabled={disabled}
              onRemove={() => {
                onChange({ ...value, bookingForm: null });
              }}
            />
          </ul>
        ) : (
          <>
            <Input
              ref={formInput}
              id={formId}
              type="file"
              accept={bookingFileAccept("booking_form")}
              aria-label="Choose the Booking Form"
              className="sr-only"
              tabIndex={-1}
              disabled={disabled}
              onChange={(event) => {
                pickForm(event.target.files?.[0]);
                event.target.value = "";
              }}
            />
            <Button
              type="button"
              variant="outline"
              disabled={disabled}
              onClick={() => formInput.current?.click()}
            >
              <FileText aria-hidden="true" />
              Add Booking Form
            </Button>
          </>
        )}
        <p className="text-muted-foreground text-xs">
          A PDF or a photo, up to 25 MB.
        </p>
      </div>
      <div className="min-w-0 space-y-2">
        <Label htmlFor={photosId}>Photos</Label>
        {value.photos.length > 0 && (
          <ul aria-label="Photos to upload" className="space-y-1.5">
            {value.photos.map((file, index) => (
              <FileRow
                key={`${file.name}-${String(file.size)}-${String(index)}`}
                file={file}
                disabled={disabled}
                onRemove={() => {
                  onChange({
                    ...value,
                    photos: value.photos.filter((_, at) => at !== index),
                  });
                }}
              />
            ))}
          </ul>
        )}
        <Input
          ref={photosInput}
          id={photosId}
          type="file"
          multiple
          accept={bookingFileAccept("photo")}
          aria-label="Choose photos"
          className="sr-only"
          tabIndex={-1}
          disabled={disabled}
          onChange={(event) => {
            const picked = Array.from(event.target.files ?? []);
            event.target.value = "";
            if (picked.length > 0) pickPhotos(picked);
          }}
        />
        <Button
          type="button"
          variant="outline"
          disabled={disabled || value.photos.length >= PHOTOS_MAX}
          onClick={() => photosInput.current?.click()}
        >
          <ImagePlus aria-hidden="true" />
          Add photos
        </Button>
        <p className="text-muted-foreground text-xs">
          PNG, JPEG or WebP. They upload when you save.
        </p>
      </div>
      {refused.length > 0 && (
        <ul
          aria-label="Not added"
          className="text-destructive text-xs sm:col-span-2"
        >
          {refused.map((line) => (
            <li key={line} className="break-words">
              {line}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * Uploads the files picked on a new booking once it exists, one at a
 * time; a failure never throws, it is named in `failed`.
 */
export function useUploadPendingBookingFiles() {
  const client = useQueryClient();
  const [uploading, setUploading] = useState(false);
  const uploadAll = useCallback(
    async (bookingId: string, files: PendingBookingFiles) => {
      const queue = [
        ...(files.bookingForm == null
          ? []
          : [{ role: "booking_form" as const, file: files.bookingForm }]),
        ...files.photos.map((file) => ({ role: "photo" as const, file })),
      ];
      const failed: string[] = [];
      if (queue.length === 0) return { failed };
      setUploading(true);
      for (const item of queue) {
        try {
          await uploadBookingFile(bookingId, item.role, item.file);
        } catch {
          failed.push(item.file.name);
        }
      }
      setUploading(false);
      await client.invalidateQueries({ queryKey: bookingFilesKey(bookingId) });
      return { failed };
    },
    [client],
  );
  return { uploadAll, uploading };
}
