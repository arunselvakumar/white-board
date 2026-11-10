"use client";

import { useCallback } from "react";

import { checkUploadFile } from "@/lib/project-uploads";
import type { UploadOptions } from "@/src/queries/direct-upload";
import { useUploadDrawingFile } from "@/src/queries/project-drawings";

import {
  useDirectUpload,
  type DirectUploadItem,
} from "../../uploads/use-direct-upload";

/** A new drawing in an album, or the next revision of a drawing. */
export type DrawingUploadTarget =
  { albumId: string; name?: string } | { drawingId: string };

export type DrawingUpload = DirectUploadItem<{ target: DrawingUploadTarget }>;

function checkDrawingFile(file: File) {
  return checkUploadFile("drawing", file);
}

/**
 * Drawing files going up (CM-408) on `useDirectUpload`: each with its own
 * progress, cancel and retry. A file the browser can already refuse (a
 * ZIP, over 100 MB) becomes an error row without a request. Uploads still
 * running when the screen goes away are cancelled.
 */
export function useDrawingUploads(projectId: string) {
  const { mutateAsync } = useUploadDrawingFile(projectId);
  const upload = useCallback(
    (
      file: File,
      meta: { target: DrawingUploadTarget },
      options: UploadOptions,
    ) => mutateAsync({ file, target: meta.target, ...options }),
    [mutateAsync],
  );
  return useDirectUpload({ upload, check: checkDrawingFile });
}

export type DrawingUploads = ReturnType<typeof useDrawingUploads>;
