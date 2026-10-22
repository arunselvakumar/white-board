"use client";

import { useSuspenseQuery } from "@tanstack/react-query";
import { ImagePlus, Trash2 } from "lucide-react";
import { useId, useRef, useState } from "react";
import { Button } from "@repo/ui/components/button";

import { FormAlert } from "@/components/auth/form-alert";
import { fieldForCode } from "@/lib/server-errors";
import {
  measurementPhotosQuery,
  useRemoveMeasurementPhoto,
  useUploadMeasurementPhoto,
} from "@/src/queries/contracts-measurements";

/**
 * A sheet's photos (CM-1105): kept on the sheet through the attachments
 * service, never in the Project Gallery. Create or Update adds them; a
 * billed sheet's photos are fixed.
 */
export function MeasurementPhotosPanel({ sheetId }: { sheetId: string }) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const { data } = useSuspenseQuery(measurementPhotosQuery(sheetId));
  const upload = useUploadMeasurementPhoto(sheetId);
  const remove = useRemoveMeasurementPhoto(sheetId);
  const [error, setError] = useState<string | undefined>();
  return (
    <section
      aria-labelledby={`${id}-title`}
      className="min-w-0 space-y-3 rounded-xl border p-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="space-y-1">
          <h3 id={`${id}-title`} className="font-semibold">
            Photos
          </h3>
          <p className="text-muted-foreground text-xs">
            Kept with the sheet, not in the Project Gallery. PNG, JPEG or WebP,
            up to 25 MB, 20 a sheet.
          </p>
        </div>
        {data.canUpload ? (
          <>
            <input
              ref={input}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              multiple
              className="sr-only"
              aria-label="Photos to add"
              tabIndex={-1}
              onChange={(event) => {
                const files = [...(event.target.files ?? [])];
                event.target.value = "";
                setError(undefined);
                void (async () => {
                  for (const file of files)
                    try {
                      await upload.mutateAsync(file);
                    } catch (failure) {
                      setError(fieldForCode(failure, {}).message);
                      return;
                    }
                })();
              }}
            />
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={upload.isPending}
              onClick={() => input.current?.click()}
            >
              <ImagePlus aria-hidden="true" />
              {upload.isPending ? "Uploading…" : "Add photos"}
            </Button>
          </>
        ) : null}
      </div>
      <FormAlert message={error} />
      {data.items.length === 0 ? (
        <p className="text-muted-foreground text-sm">No photos yet.</p>
      ) : (
        <ul
          aria-label="Photos"
          className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4"
        >
          {data.items.map((photo) => (
            <li key={photo.id} className="min-w-0 space-y-1">
              <a
                href={photo.url}
                target="_blank"
                rel="noreferrer"
                className="bg-muted block aspect-[4/3] overflow-hidden rounded-lg border"
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- a private, signed-in route */}
                <img
                  src={photo.thumbUrl ?? photo.url}
                  alt={photo.fileName}
                  className="size-full object-cover"
                  loading="lazy"
                />
              </a>
              <div className="flex min-w-0 items-center justify-between gap-1">
                <p className="text-muted-foreground truncate text-xs">
                  {photo.createdByName ?? photo.fileName}
                </p>
                {photo.canRemove ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    aria-label={`Remove ${photo.fileName}`}
                    disabled={remove.isPending}
                    onClick={() => {
                      setError(undefined);
                      remove.mutate(photo.id, {
                        onError: (failure) => {
                          setError(fieldForCode(failure, {}).message);
                        },
                      });
                    }}
                  >
                    <Trash2 aria-hidden="true" />
                  </Button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
