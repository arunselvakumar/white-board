"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useState } from "react";

import type { TrackingDocumentType } from "@/src/tracking/domain/tracking-documents";
import {
  trackingDocumentKey,
  uploadTrackingFile,
  type TrackingDocumentFile,
} from "@/src/queries/tracking-documents";

export type PendingTrackingUploadResult = {
  uploaded: TrackingDocumentFile[];
  /** Names of the files that did not go up (the document is saved anyway). */
  failed: string[];
};

/**
 * Uploads files picked on a **new** task, issue or inspection form
 * (`TrackingPendingFilesField`) once the document exists:
 *
 * ```ts
 * const { uploadAll, uploading } = useUploadPendingTrackingFiles("issue");
 * const saved = await create.mutateAsync(input);
 * const { failed } = await uploadAll(saved.id, values.photos);
 * ```
 *
 * One file at a time, in the order picked; a failure never throws, it is
 * named in `failed` so the page can say "2 photos did not upload" and the
 * detail page's files section lets the member try again. `done` counts
 * files finished so far, for a "Uploading photos 2 of 5" line.
 */
export function useUploadPendingTrackingFiles(type: TrackingDocumentType) {
  const queryClient = useQueryClient();
  const [state, setState] = useState({
    uploading: false,
    done: 0,
    total: 0,
  });
  const uploadAll = useCallback(
    async (
      documentId: string,
      files: readonly File[],
    ): Promise<PendingTrackingUploadResult> => {
      const uploaded: TrackingDocumentFile[] = [];
      const failed: string[] = [];
      if (files.length === 0) return { uploaded, failed };
      setState({ uploading: true, done: 0, total: files.length });
      for (const file of files) {
        try {
          uploaded.push(await uploadTrackingFile(type, documentId, file));
        } catch {
          failed.push(file.name);
        }
        setState((current) => ({ ...current, done: current.done + 1 }));
      }
      setState((current) => ({ ...current, uploading: false }));
      await queryClient.invalidateQueries({
        queryKey: trackingDocumentKey(type, documentId),
      });
      return { uploaded, failed };
    },
    [type, queryClient],
  );
  return { uploadAll, ...state };
}
