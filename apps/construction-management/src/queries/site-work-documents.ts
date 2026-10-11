import {
  queryOptions,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";

import type {
  ConstructionSiteWorkDocumentFileResponseModel,
  ConstructionSiteWorkRemarkResponseModel,
  ListConstructionSiteWorkDocumentFilesResponseModel,
  ListConstructionSiteWorkRemarksResponseModel,
} from "@/app/api/construction/site-work/documents/document-models";
import { formatBytes } from "@/lib/project-documents";
import { isProgramName } from "@/src/shared-kernel/attachments/program-names";
import { acceptedExtensions } from "@/src/shared-kernel/attachments/upload-policy";
import { fileExtension } from "@/src/shared-kernel/files/file-name";
import {
  SITE_WORK_DOCUMENT_FILES_MAX,
  SITE_WORK_FILE_ACCEPTS,
  SITE_WORK_FILE_MAX_BYTES,
  SITE_WORK_REMARK_FILES_MAX,
  takesImagesOnly,
} from "@/src/site-work/domain/document-thread";
import type { SiteWorkDocumentType } from "@/src/site-work/domain/site-work-documents";

import { directUpload, postJson, type UploadOptions } from "./direct-upload";
import { apiJson, QueryHttpError } from "./http";
import { SITE_WORK_API, SITE_WORK_KEY } from "./site-work-access";

export type SiteWorkRemark = ConstructionSiteWorkRemarkResponseModel;
export type SiteWorkRemarks = ListConstructionSiteWorkRemarksResponseModel;
export type SiteWorkDocumentFile =
  ConstructionSiteWorkDocumentFileResponseModel;
export type SiteWorkDocumentFiles =
  ListConstructionSiteWorkDocumentFilesResponseModel;

export {
  SITE_WORK_DOCUMENT_FILES_MAX,
  SITE_WORK_REMARK_FILES_MAX,
  takesImagesOnly,
};

/** `/api/construction/site-work/documents/{type}/{id}` (M6). */
export function siteWorkDocumentPath(
  type: SiteWorkDocumentType,
  id: string,
): string {
  return `${SITE_WORK_API}/documents/${type}/${encodeURIComponent(id)}`;
}

/**
 * Every key of one document's thread and files. A sheet's own mutations
 * may invalidate it (a delete, a duplicate) with
 * `queryClient.invalidateQueries({ queryKey: siteWorkDocumentKey(type, id) })`.
 */
export function siteWorkDocumentKey(type: SiteWorkDocumentType, id: string) {
  return [...SITE_WORK_KEY, "documents", type, id] as const;
}

/** The remarks thread, oldest first. */
export function siteWorkRemarksQuery(type: SiteWorkDocumentType, id: string) {
  return queryOptions({
    queryKey: [...siteWorkDocumentKey(type, id), "remarks"] as const,
    queryFn: () =>
      apiJson<SiteWorkRemarks>(`${siteWorkDocumentPath(type, id)}/remarks`),
  });
}

/** The document's live files, oldest first (remarks' files included). */
export function siteWorkFilesQuery(type: SiteWorkDocumentType, id: string) {
  return queryOptions({
    queryKey: [...siteWorkDocumentKey(type, id), "files"] as const,
    queryFn: () =>
      apiJson<SiteWorkDocumentFiles>(`${siteWorkDocumentPath(type, id)}/files`),
  });
}

/** The `accept` of a file input for this document type. */
export function siteWorkFileInputAccept(type: SiteWorkDocumentType): string {
  return takesImagesOnly(type)
    ? "image/png,image/jpeg,image/webp"
    : "application/pdf,image/png,image/jpeg,image/webp";
}

/** "Photos (PNG, JPEG or WebP), up to 25 MB each." for the form's hint. */
export function siteWorkFileHint(type: SiteWorkDocumentType): string {
  const size = formatBytes(SITE_WORK_FILE_MAX_BYTES);
  return takesImagesOnly(type)
    ? `Photos (PNG, JPEG or WebP), up to ${size} each.`
    : `PDF or photos (PNG, JPEG or WebP), up to ${size} each.`;
}

export type SiteWorkFileProblem = {
  code: "FILE_TYPE_NOT_ALLOWED" | "FILE_TOO_LARGE" | "FILE_EMPTY";
  message: string;
};

/**
 * What the browser can refuse before any byte moves (the server checks
 * again, by content); null when the file may go up.
 */
export function checkSiteWorkFile(
  type: SiteWorkDocumentType,
  file: { name: string; size: number },
): SiteWorkFileProblem | null {
  const allowed = acceptedExtensions(SITE_WORK_FILE_ACCEPTS[type]) ?? [];
  const extension = fileExtension(file.name);
  if (
    isProgramName(file.name) ||
    extension == null ||
    !allowed.includes(extension)
  )
    return {
      code: "FILE_TYPE_NOT_ALLOWED",
      message: takesImagesOnly(type)
        ? "Only photos (PNG, JPEG or WebP) can be added here."
        : "Only a PDF or a photo (PNG, JPEG or WebP) can be added here.",
    };
  if (file.size === 0)
    return { code: "FILE_EMPTY", message: "This file is empty." };
  if (file.size > SITE_WORK_FILE_MAX_BYTES)
    return {
      code: "FILE_TOO_LARGE",
      message: `Files can be at most ${formatBytes(SITE_WORK_FILE_MAX_BYTES)}.`,
    };
  return null;
}

/**
 * Attaches one file to a document through `directUpload` (CM-407): start,
 * the bytes straight to storage (or our route in development), an image's
 * thumbnail, then complete, which records it.
 */
export async function uploadSiteWorkFile(
  type: SiteWorkDocumentType,
  id: string,
  file: File,
  options: UploadOptions = {},
): Promise<SiteWorkDocumentFile> {
  const problem = checkSiteWorkFile(type, file);
  if (problem != null) throw new QueryHttpError(400, problem);
  const base = `${siteWorkDocumentPath(type, id)}/files`;
  return directUpload({
    startUrl: `${base}/uploads`,
    file,
    options,
    complete: (started, signal) =>
      postJson<SiteWorkDocumentFile>(
        base,
        { key: started.key, fileName: started.fileName },
        signal,
      ),
  });
}

/** Posts a remark with already uploaded files; refreshes the thread. */
export function useAddSiteWorkRemark(type: SiteWorkDocumentType, id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { body: string; fileIds: string[] }) =>
      postJson<SiteWorkRemark>(
        `${siteWorkDocumentPath(type, id)}/remarks`,
        input,
      ),
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: siteWorkDocumentKey(type, id),
      }),
  });
}

/** Refreshes the files after a remove, and after a 404 (it is gone anyway). */
export function useRemoveSiteWorkFile(type: SiteWorkDocumentType, id: string) {
  const queryClient = useQueryClient();
  const refresh = () =>
    queryClient.invalidateQueries({
      queryKey: siteWorkDocumentKey(type, id),
    });
  return useMutation({
    mutationFn: (fileId: string) =>
      postJson<undefined>(
        `${siteWorkDocumentPath(type, id)}/files/${encodeURIComponent(fileId)}/delete`,
        {},
      ),
    onSuccess: refresh,
    onError: (error) =>
      error instanceof QueryHttpError && error.status === 404
        ? refresh()
        : undefined,
  });
}
