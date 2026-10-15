"use client";

import { useState } from "react";

import { FileViewer } from "@/components/projects/files/file-viewer";
import type { TrackingDocumentFile } from "@/src/queries/tracking-documents";

import {
  TrackingSavedFileTile,
  trackingFileLine,
  trackingViewable,
} from "./tracking-file-parts";

export type TrackingFileStripProps = {
  /** Saved files: an entry's (from the feature's response) or a document's. */
  files: readonly TrackingDocumentFile[];
  /** The list's accessible name, e.g. "Photos of the update on 12 Oct". */
  label: string;
  /** Tiles before "+N" (6 by default). */
  max?: number;
};

/**
 * A row of small thumbnails under a feed entry — a progress update, an
 * issue update, an observation (CM-0019 §11). Tapping a tile opens the
 * image or PDF; "+N" says how many more there are. It wraps instead of
 * scrolling sideways, and renders nothing without files.
 */
export function TrackingFileStrip({
  files,
  label,
  max = 6,
}: TrackingFileStripProps) {
  const [opened, setOpened] = useState<TrackingDocumentFile | null>(null);
  if (files.length === 0) return null;
  const shown = files.slice(0, max);
  const more = files.length - shown.length;
  return (
    <>
      <ul aria-label={label} className="flex min-w-0 flex-wrap gap-2">
        {shown.map((file) => (
          <TrackingSavedFileTile
            key={file.id}
            file={file}
            onOpen={setOpened}
            showName={false}
            className="w-16"
          />
        ))}
        {more > 0 ? (
          <li
            className="bg-muted text-muted-foreground flex size-16 items-center justify-center rounded-md border text-sm font-medium"
            aria-label={`${String(more)} more files`}
          >
            +{more}
          </li>
        ) : null}
      </ul>
      <FileViewer
        file={opened == null ? null : trackingViewable(opened)}
        description={opened == null ? undefined : trackingFileLine(opened)}
        onClose={() => {
          setOpened(null);
        }}
      />
    </>
  );
}
