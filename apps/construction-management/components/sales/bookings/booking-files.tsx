"use client";

import { useSuspenseQuery } from "@tanstack/react-query";
import { FileText, ImagePlus, Trash2 } from "lucide-react";
import { Suspense, useRef, useState } from "react";
import { Button } from "@repo/ui/components/button";
import { Input } from "@repo/ui/components/input";
import { Skeleton } from "@repo/ui/components/skeleton";

import { FormAlert } from "@/components/auth/form-alert";
import { formatBytes } from "@/lib/project-documents";
import { QueryHttpError } from "@/src/queries/http";
import {
  bookingFileAccept,
  bookingFilesQuery,
  useRemoveBookingFile,
  useUploadBookingFile,
  type BookingFile,
} from "@/src/queries/sales-bookings";
import type { BookingFileRole } from "@/src/sales/application/booking-files";

function message(caught: unknown): string {
  return caught instanceof QueryHttpError
    ? caught.message
    : "Couldn't upload. Try again.";
}

function FileItem({
  file,
  onRemove,
  removing,
}: {
  file: BookingFile;
  onRemove: () => void;
  removing: boolean;
}) {
  return (
    <li className="flex min-w-0 items-center gap-3 rounded-md border p-2 text-sm">
      {file.thumbUrl != null ? (
        // eslint-disable-next-line @next/next/no-img-element -- our authenticated file route
        <img
          src={file.thumbUrl}
          alt=""
          className="size-10 shrink-0 rounded object-cover"
        />
      ) : (
        <FileText
          aria-hidden="true"
          className="text-muted-foreground size-5 shrink-0"
        />
      )}
      <a
        href={file.url}
        target="_blank"
        rel="noreferrer"
        className="min-w-0 flex-1 truncate font-medium hover:underline"
      >
        {file.fileName}
      </a>
      <span className="text-muted-foreground shrink-0 text-xs">
        {formatBytes(file.bytes)}
      </span>
      {file.canRemove && (
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={`Remove ${file.fileName}`}
          disabled={removing}
          onClick={onRemove}
        >
          <Trash2 />
        </Button>
      )}
    </li>
  );
}

function Files({ bookingId }: { bookingId: string }) {
  const { data } = useSuspenseQuery(bookingFilesQuery(bookingId));
  const upload = useUploadBookingFile(bookingId);
  const remove = useRemoveBookingFile(bookingId);
  const [error, setError] = useState<string | undefined>();
  const formInput = useRef<HTMLInputElement>(null);
  const photoInput = useRef<HTMLInputElement>(null);
  const form = data.items.find((file) => file.role === "booking_form");
  const photos = data.items.filter((file) => file.role === "photo");

  const send = async (role: BookingFileRole, files: File[]) => {
    setError(undefined);
    for (const file of files) {
      try {
        await upload.mutateAsync({ role, file });
      } catch (caught) {
        setError(`${file.name}: ${message(caught)}`);
      }
    }
  };
  const removeFile = (file: BookingFile) => {
    setError(undefined);
    remove.mutate(file.id, {
      onError: (caught) => {
        setError(message(caught));
      },
    });
  };

  return (
    <div className="space-y-4">
      <FormAlert message={error} />
      <div className="space-y-2">
        <h4 className="text-muted-foreground text-xs font-medium">
          Booking Form
        </h4>
        {form != null ? (
          <ul aria-label="Booking Form">
            <FileItem
              file={form}
              removing={remove.isPending}
              onRemove={() => {
                removeFile(form);
              }}
            />
          </ul>
        ) : data.canUpload ? (
          <>
            <Input
              ref={formInput}
              type="file"
              accept={bookingFileAccept("booking_form")}
              aria-label="Choose the Booking Form"
              className="sr-only"
              tabIndex={-1}
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                if (file != null) void send("booking_form", [file]);
              }}
            />
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={upload.isPending}
              onClick={() => formInput.current?.click()}
            >
              <FileText aria-hidden="true" />
              Upload Booking Form
            </Button>
          </>
        ) : (
          <p className="text-muted-foreground text-sm">None yet.</p>
        )}
      </div>
      <div className="space-y-2">
        <h4 className="text-muted-foreground text-xs font-medium">Photos</h4>
        {photos.length > 0 ? (
          <ul aria-label="Photos" className="grid gap-2 sm:grid-cols-2">
            {photos.map((file) => (
              <FileItem
                key={file.id}
                file={file}
                removing={remove.isPending}
                onRemove={() => {
                  removeFile(file);
                }}
              />
            ))}
          </ul>
        ) : (
          <p className="text-muted-foreground text-sm">No photos yet.</p>
        )}
        {data.canUpload && (
          <>
            <Input
              ref={photoInput}
              type="file"
              multiple
              accept={bookingFileAccept("photo")}
              aria-label="Choose photos"
              className="sr-only"
              tabIndex={-1}
              onChange={(event) => {
                const files = Array.from(event.target.files ?? []);
                event.target.value = "";
                if (files.length > 0) void send("photo", files);
              }}
            />
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={upload.isPending}
              onClick={() => photoInput.current?.click()}
            >
              <ImagePlus aria-hidden="true" />
              {upload.isPending ? "Uploading…" : "Add photos"}
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

/**
 * A booking's **Booking Form** and **photos** (CM-1006). Create or Update
 * holders upload; Update removes any, an uploader their own. Personal
 * data: never in the Project Gallery.
 */
export function BookingFiles({ bookingId }: { bookingId: string }) {
  return (
    <section
      aria-labelledby="booking-files"
      className="space-y-3 rounded-lg border p-4"
    >
      <h3 id="booking-files" className="text-sm font-semibold">
        Booking Form and photos
      </h3>
      <Suspense fallback={<Skeleton className="h-16 w-full" />}>
        <Files bookingId={bookingId} />
      </Suspense>
    </section>
  );
}
