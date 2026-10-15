"use client";

import { useDirectUpload } from "@/components/uploads/use-direct-upload";
import {
  checkTrackingFile,
  uploadTrackingFile,
  type TrackingDocumentFile,
  type TrackingFileAccept,
} from "@/src/queries/tracking-documents";
import type { TrackingDocumentType } from "@/src/tracking/domain/tracking-documents";

/**
 * Files going up to an **existing** task, issue or inspection (CM-0019
 * §11), each with progress, error, retry and cancel. `accept` may be
 * stricter than the document's policy (`images` for an issue update's
 * photos). Each finished upload is a file of the document with no entry
 * yet; `onUploaded` gets it (post it with an entry by id, or refresh the
 * document's files).
 *
 * ```ts
 * const { uploads, add, retry, dismiss, canRetry } = useTrackingFileUploads({
 *   documentType: "issue", documentId, accept: "images",
 *   onUploaded: (file, item) => { setFiles((all) => [...all, file]); dismiss(item.id); },
 * });
 * ```
 */
export function useTrackingFileUploads(options: {
  documentType: TrackingDocumentType;
  documentId: string;
  accept: TrackingFileAccept;
  onUploaded: (
    file: TrackingDocumentFile,
    upload: { id: string; file: File },
  ) => void;
}) {
  const { documentType, documentId, accept, onUploaded } = options;
  return useDirectUpload<object, TrackingDocumentFile>({
    upload: (file, _meta, uploadOptions) =>
      uploadTrackingFile(documentType, documentId, file, uploadOptions),
    check: (file) => checkTrackingFile(accept, file),
    onUploaded,
  });
}
