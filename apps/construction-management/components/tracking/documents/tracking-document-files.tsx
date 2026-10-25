"use client";

import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { ImagePlus, Paperclip } from "lucide-react";
import { useId, useRef, useState } from "react";
import { Button } from "@repo/ui/components/button";
import { Input } from "@repo/ui/components/input";

import { DocumentSection } from "@/components/procurement/documents/document-section";
import { FileViewer } from "@/components/projects/files/file-viewer";
import {
  TRACKING_DOCUMENT_FILES_MAX,
  trackingDocumentKey,
  trackingFileAccept,
  trackingFileHint,
  trackingFileInputAccept,
  trackingFilesQuery,
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

export type TrackingDocumentFilesProps = {
  documentType: TrackingDocumentType;
  documentId: string;
  /** Whether the page lets the viewer add and remove files (from access). */
  canEdit: boolean;
  /** "Photos" or "Files" by the document's policy unless given. */
  heading?: string;
};

/**
 * A task's, issue's or inspection's own photos and files (CM-0019 §11) as
 * a section of thumbnails; files posted with an entry (a progress update,
 * an issue update, an observation) stay with their entry. With `canEdit`
 * (and the upload right, which the server reports), files upload at once
 * with progress, and × removes one the viewer may remove. Tasks take
 * photos only; issues and inspections a PDF or photos.
 *
 * Reads with `useSuspenseQuery` inside its own section frame (skeleton,
 * "Try again"). On a **new** form use `TrackingPendingFilesField`; in an
 * entry composer use `TrackingEntryFilesField`.
 */
export function TrackingDocumentFiles(props: TrackingDocumentFilesProps) {
  const headingId = useId();
  return (
    <DocumentSection
      heading={
        props.heading ??
        trackingFilesHeading(trackingFileAccept(props.documentType))
      }
      headingId={headingId}
    >
      <FilesBody {...props} />
    </DocumentSection>
  );
}

function FilesBody({
  documentType,
  documentId,
  canEdit,
  heading,
}: TrackingDocumentFilesProps) {
  const queryClient = useQueryClient();
  const input = useRef<HTMLInputElement>(null);
  const accept = trackingFileAccept(documentType);
  const title = heading ?? trackingFilesHeading(accept);
  const { data } = useSuspenseQuery(
    trackingFilesQuery(documentType, documentId),
  );
  const [opened, setOpened] = useState<TrackingDocumentFile | null>(null);
  const [removing, setRemoving] = useState<TrackingDocumentFile | null>(null);
  const { uploads, add, retry, dismiss, canRetry } = useTrackingFileUploads({
    documentType,
    documentId,
    accept,
    onUploaded: (_file, item) => {
      void queryClient
        .invalidateQueries({
          queryKey: trackingDocumentKey(documentType, documentId),
        })
        .then(() => {
          dismiss(item.id);
        });
    },
  });

  const files = data.items.filter((file) => file.entryId == null);
  const mayUpload = canEdit && data.canUpload;
  const pending = uploads.filter((upload) => upload.state !== "done");
  const room = Math.max(
    0,
    TRACKING_DOCUMENT_FILES_MAX - data.items.length - pending.length,
  );
  const noun = trackingFileNoun(accept);
  const photos = accept === "images";

  return (
    <div className="space-y-3">
      {files.length === 0 && pending.length === 0 ? (
        <p className="bg-card text-muted-foreground rounded-lg border border-dashed p-6 text-center text-sm">
          {mayUpload
            ? photos
              ? "No photos yet. Add photos of the work."
              : "No files yet. Add a PDF or photos."
            : `No ${noun}s.`}
        </p>
      ) : (
        <ul
          aria-label={title}
          className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4"
        >
          {files.map((file) => (
            <TrackingSavedFileTile
              key={file.id}
              file={file}
              onOpen={setOpened}
              {...(canEdit && file.canRemove ? { onRemove: setRemoving } : {})}
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
      )}
      {mayUpload ? (
        <div className="relative">
          <Input
            ref={input}
            type="file"
            multiple
            accept={trackingFileInputAccept(accept)}
            aria-label={`Choose ${noun}s for ${title}`}
            className="sr-only top-0 left-0"
            tabIndex={-1}
            onChange={(event) => {
              const picked = Array.from(event.target.files ?? []).slice(
                0,
                room,
              );
              event.target.value = "";
              if (picked.length > 0) add(picked, {});
            }}
          />
          <Button
            type="button"
            variant="outline"
            disabled={room === 0}
            onClick={() => input.current?.click()}
          >
            {photos ? (
              <ImagePlus aria-hidden="true" />
            ) : (
              <Paperclip aria-hidden="true" />
            )}
            {photos ? "Add photos" : "Add files"}
          </Button>
          <p className="text-muted-foreground mt-1.5 text-xs">
            {room === 0
              ? `This document has ${String(TRACKING_DOCUMENT_FILES_MAX)} ${noun}s, the most it can keep. Remove one to add another.`
              : trackingFileHint(accept)}
          </p>
        </div>
      ) : null}
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
      />
    </div>
  );
}
