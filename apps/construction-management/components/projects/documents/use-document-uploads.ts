"use client";

import { useCallback } from "react";

import { checkDocumentFile } from "@/lib/project-documents";
import type { ProjectDocumentKind } from "@/src/projects/domain/project-document-rules";
import type { UploadOptions } from "@/src/queries/direct-upload";
import { useUploadProjectDocument } from "@/src/queries/project-documents";

import {
  useDirectUpload,
  type DirectUploadItem,
} from "../../uploads/use-direct-upload";

export type DocumentUpload = DirectUploadItem<{ kind: ProjectDocumentKind }>;

/**
 * Files going up to one Project's Documents, on `useDirectUpload`
 * (CM-407): each with its own progress, error and retry. A file the
 * browser can already refuse (a program, over 25 MB) becomes an error row
 * without a request. Uploads still running when the screen goes away are
 * cancelled.
 */
export function useDocumentUploads(projectId: string) {
  const { mutateAsync } = useUploadProjectDocument(projectId);
  const upload = useCallback(
    (file: File, meta: { kind: ProjectDocumentKind }, options: UploadOptions) =>
      mutateAsync({ file, kind: meta.kind, ...options }),
    [mutateAsync],
  );
  const { uploads, add, retry, dismiss, clearSettled } = useDirectUpload({
    upload,
    check: checkDocumentFile,
  });
  const addKind = useCallback(
    (files: Iterable<File>, kind: ProjectDocumentKind) => {
      add(files, { kind });
    },
    [add],
  );
  return { uploads, add: addKind, retry, dismiss, clearSettled };
}

/** Whether a file can be retried (a refused program or size cannot). */
export function canRetry(upload: DocumentUpload): boolean {
  return (
    upload.state === "error" &&
    upload.retryable !== false &&
    checkDocumentFile(upload.file) == null
  );
}
