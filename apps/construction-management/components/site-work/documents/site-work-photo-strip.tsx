"use client";

import { useSuspenseQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Button } from "@repo/ui/components/button";

import { FileThumbnail } from "@/components/projects/files/file-thumbnail";
import { FileViewer } from "@/components/projects/files/file-viewer";
import {
  siteWorkFilesQuery,
  type SiteWorkDocumentFile,
} from "@/src/queries/site-work-documents";
import type { SiteWorkDocumentType } from "@/src/site-work/domain/site-work-documents";

import { siteWorkFileLine, siteWorkViewable } from "./site-work-file-parts";

const IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);

export type SiteWorkPhotoStripProps = {
  /** Saved files; only images show (PDFs stay in the files section). */
  files: readonly SiteWorkDocumentFile[];
  /** The list's accessible name, e.g. "Photos of WS/26-27/00012". */
  label: string;
  /** Tiles before "+N" (6 by default). */
  max?: number;
  /** Tile size class; `size-16` by default. */
  tileClassName?: string;
};

/**
 * A row of photo thumbnails (a worksheet card, a diary summary, a DPR
 * preview). Tapping a tile opens the full image; "+N" says how many more
 * there are. It wraps instead of scrolling sideways, and renders nothing
 * without images.
 */
export function SiteWorkPhotoStrip({
  files,
  label,
  max = 6,
  tileClassName = "size-16",
}: SiteWorkPhotoStripProps) {
  const [opened, setOpened] = useState<SiteWorkDocumentFile | null>(null);
  const images = files.filter((file) => IMAGE_TYPES.has(file.contentType));
  if (images.length === 0) return null;
  const shown = images.slice(0, max);
  const more = images.length - shown.length;
  return (
    <>
      <ul aria-label={label} className="flex min-w-0 flex-wrap gap-2">
        {shown.map((file) => (
          <li key={file.id}>
            <Button
              type="button"
              variant="ghost"
              aria-label={`Open ${file.fileName}`}
              className="h-auto rounded-md p-0"
              onClick={() => {
                setOpened(file);
              }}
            >
              <FileThumbnail
                file={siteWorkViewable(file)}
                className={`${tileClassName} border hover:opacity-90`}
              />
            </Button>
          </li>
        ))}
        {more > 0 ? (
          <li
            className={`${tileClassName} bg-muted text-muted-foreground flex items-center justify-center rounded-md border text-sm font-medium`}
            aria-label={`${String(more)} more photos`}
          >
            +{more}
          </li>
        ) : null}
      </ul>
      <FileViewer
        file={opened == null ? null : siteWorkViewable(opened)}
        description={opened == null ? undefined : siteWorkFileLine(opened)}
        onClose={() => {
          setOpened(null);
        }}
      />
    </>
  );
}

/**
 * The document's own photos as a strip, read with `siteWorkFilesQuery`
 * (suspends: wrap it in `<Suspense>`). Remarks' photos are left out.
 */
export function SiteWorkDocumentPhotoStrip({
  documentType,
  documentId,
  label,
  max,
}: {
  documentType: SiteWorkDocumentType;
  documentId: string;
  label: string;
  max?: number;
}) {
  const { data } = useSuspenseQuery(
    siteWorkFilesQuery(documentType, documentId),
  );
  return (
    <SiteWorkPhotoStrip
      files={data.items.filter((file) => file.remarkId == null)}
      label={label}
      {...(max == null ? {} : { max })}
    />
  );
}
