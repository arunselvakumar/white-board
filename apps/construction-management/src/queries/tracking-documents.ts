import {
  queryOptions,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";

import type {
  ConstructionTrackingDocumentFileResponseModel,
  ListConstructionTrackingDocumentFilesResponseModel,
} from "@/app/api/construction/tracking/documents/document-models";
import { formatBytes } from "@/lib/project-documents";
import { isProgramName } from "@/src/shared-kernel/attachments/program-names";
import {
  acceptedExtensions,
  type UploadAccept,
} from "@/src/shared-kernel/attachments/upload-policy";
import { fileExtension } from "@/src/shared-kernel/files/file-name";
import {
  TRACKING_DOCUMENT_FILES_MAX,
  TRACKING_ENTRY_FILES_MAX,
  TRACKING_FILE_ACCEPTS,
  TRACKING_FILE_MAX_BYTES,
} from "@/src/tracking/domain/document-files";
import type { TrackingDocumentType } from "@/src/tracking/domain/tracking-documents";

import { directUpload, postJson, type UploadOptions } from "./direct-upload";
import { apiJson, QueryHttpError } from "./http";
import { TRACKING_API, TRACKING_KEY } from "./tracking-access";

export type TrackingDocumentFile =
  ConstructionTrackingDocumentFileResponseModel;
export type TrackingDocumentFiles =
  ListConstructionTrackingDocumentFilesResponseModel;

export { TRACKING_DOCUMENT_FILES_MAX, TRACKING_ENTRY_FILES_MAX };

/**
 * What a file picker takes: the document's policy (`images` on tasks,
 * `pdf_or_image` on issues and inspections), or `images` for a composer
 * that asks for photos only (an issue update).
 */
export type TrackingFileAccept = UploadAccept;

export function trackingFileAccept(
  type: TrackingDocumentType,
  photosOnly = false,
): TrackingFileAccept {
  return photosOnly ? "images" : TRACKING_FILE_ACCEPTS[type];
}

/** `/api/construction/tracking/documents/{type}/{id}` (M8). */
export function trackingDocumentPath(
  type: TrackingDocumentType,
  id: string,
): string {
  return `${TRACKING_API}/documents/${type}/${encodeURIComponent(id)}`;
}

/**
 * Every key of one document's files. A feature's own mutations that post
 * or delete an entry with files invalidate it:
 * `queryClient.invalidateQueries({ queryKey: trackingDocumentKey(type, id) })`.
 */
export function trackingDocumentKey(type: TrackingDocumentType, id: string) {
  return [...TRACKING_KEY, "documents", type, id] as const;
}

/** The document's live files, oldest first (entries' files included). */
export function trackingFilesQuery(type: TrackingDocumentType, id: string) {
  return queryOptions({
    queryKey: [...trackingDocumentKey(type, id), "files"] as const,
    queryFn: () =>
      apiJson<TrackingDocumentFiles>(`${trackingDocumentPath(type, id)}/files`),
  });
}

/** The `accept` of a file input. */
export function trackingFileInputAccept(accept: TrackingFileAccept): string {
  return accept === "images"
    ? "image/png,image/jpeg,image/webp"
    : "application/pdf,image/png,image/jpeg,image/webp";
}

/** "Photos (PNG, JPEG or WebP), up to 25 MB each." for the form's hint. */
export function trackingFileHint(accept: TrackingFileAccept): string {
  const size = formatBytes(TRACKING_FILE_MAX_BYTES);
  return accept === "images"
    ? `Photos (PNG, JPEG or WebP), up to ${size} each.`
    : `PDF or photos (PNG, JPEG or WebP), up to ${size} each.`;
}

export type TrackingFileProblem = {
  code: "FILE_TYPE_NOT_ALLOWED" | "FILE_TOO_LARGE" | "FILE_EMPTY";
  message: string;
};

/**
 * What the browser can refuse before any byte moves (the server checks
 * again, by content); null when the file may go up.
 */
export function checkTrackingFile(
  accept: TrackingFileAccept,
  file: { name: string; size: number },
): TrackingFileProblem | null {
  const allowed = acceptedExtensions(accept) ?? [];
  const extension = fileExtension(file.name);
  if (
    isProgramName(file.name) ||
    extension == null ||
    !allowed.includes(extension)
  )
    return {
      code: "FILE_TYPE_NOT_ALLOWED",
      message:
        accept === "images"
          ? "Only photos (PNG, JPEG or WebP) can be added here."
          : "Only a PDF or a photo (PNG, JPEG or WebP) can be added here.",
    };
  if (file.size === 0)
    return { code: "FILE_EMPTY", message: "This file is empty." };
  if (file.size > TRACKING_FILE_MAX_BYTES)
    return {
      code: "FILE_TOO_LARGE",
      message: `Files can be at most ${formatBytes(TRACKING_FILE_MAX_BYTES)}.`,
    };
  return null;
}

/**
 * Uploads one file to a document through `directUpload` (CM-407): start,
 * the bytes straight to storage (or our route in development), an image's
 * thumbnail, then complete, which records it (no entry yet).
 */
export async function uploadTrackingFile(
  type: TrackingDocumentType,
  id: string,
  file: File,
  options: UploadOptions = {},
): Promise<TrackingDocumentFile> {
  const problem = checkTrackingFile(TRACKING_FILE_ACCEPTS[type], file);
  if (problem != null) throw new QueryHttpError(400, problem);
  const base = `${trackingDocumentPath(type, id)}/files`;
  return directUpload({
    startUrl: `${base}/uploads`,
    file,
    options,
    complete: (started, signal) =>
      postJson<TrackingDocumentFile>(
        base,
        { key: started.key, fileName: started.fileName },
        signal,
      ),
  });
}

/** Removes a file; refreshes the files after a remove, and after a 404. */
export function useRemoveTrackingFile(type: TrackingDocumentType, id: string) {
  const queryClient = useQueryClient();
  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: trackingDocumentKey(type, id) });
  return useMutation({
    mutationFn: (fileId: string) =>
      postJson<undefined>(
        `${trackingDocumentPath(type, id)}/files/${encodeURIComponent(fileId)}/delete`,
        {},
      ),
    onSuccess: refresh,
    onError: (error) =>
      error instanceof QueryHttpError && error.status === 404
        ? refresh()
        : undefined,
  });
}
