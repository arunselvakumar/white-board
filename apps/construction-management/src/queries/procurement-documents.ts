import {
  queryOptions,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";

import type {
  ConstructionProcurementDocumentFileResponseModel,
  ConstructionProcurementRemarkResponseModel,
  ListConstructionProcurementDocumentFilesResponseModel,
  ListConstructionProcurementRemarksResponseModel,
} from "@/app/api/construction/procurement/documents/document-models";
import { formatBytes } from "@/lib/project-documents";
import { isProgramName } from "@/src/shared-kernel/attachments/program-names";
import {
  DOCUMENT_FILE_MAX_BYTES,
  REMARK_FILES_MAX,
} from "@/src/procurement/domain/document-thread";
import type { ProcurementDocumentType } from "@/src/procurement/domain/documents";

import { directUpload, postJson, type UploadOptions } from "./direct-upload";
import { apiJson, QueryHttpError } from "./http";
import { PROCUREMENT_API, PROCUREMENT_KEY } from "./procurement-access";

export type DocumentRemark = ConstructionProcurementRemarkResponseModel;
export type DocumentRemarks = ListConstructionProcurementRemarksResponseModel;
export type DocumentFile = ConstructionProcurementDocumentFileResponseModel;
export type DocumentFiles =
  ListConstructionProcurementDocumentFilesResponseModel;

export { REMARK_FILES_MAX };

/** `/api/construction/procurement/documents/{type}/{id}` (M5). */
export function procurementDocumentPath(
  type: ProcurementDocumentType,
  id: string,
): string {
  return `${PROCUREMENT_API}/documents/${type}/${encodeURIComponent(id)}`;
}

/** Every key of one document's thread and files. */
export function procurementDocumentKey(
  type: ProcurementDocumentType,
  id: string,
) {
  return [...PROCUREMENT_KEY, "documents", type, id] as const;
}

/** The remarks / comments thread, oldest first. */
export function documentRemarksQuery(
  type: ProcurementDocumentType,
  id: string,
) {
  return queryOptions({
    queryKey: [...procurementDocumentKey(type, id), "remarks"] as const,
    queryFn: () =>
      apiJson<DocumentRemarks>(`${procurementDocumentPath(type, id)}/remarks`),
  });
}

/** The document's live files, oldest first (remarks' files included). */
export function documentFilesQuery(type: ProcurementDocumentType, id: string) {
  return queryOptions({
    queryKey: [...procurementDocumentKey(type, id), "files"] as const,
    queryFn: () =>
      apiJson<DocumentFiles>(`${procurementDocumentPath(type, id)}/files`),
  });
}

export type DocumentFileProblem = {
  code: "FILE_TYPE_NOT_ALLOWED" | "FILE_TOO_LARGE" | "FILE_EMPTY";
  message: string;
};

/** What the browser can refuse before any byte moves; null when it may go up. */
export function checkDocumentUpload(file: {
  name: string;
  size: number;
}): DocumentFileProblem | null {
  if (isProgramName(file.name))
    return {
      code: "FILE_TYPE_NOT_ALLOWED",
      message: "Programs can't be attached.",
    };
  if (file.size === 0)
    return { code: "FILE_EMPTY", message: "This file is empty." };
  if (file.size > DOCUMENT_FILE_MAX_BYTES)
    return {
      code: "FILE_TOO_LARGE",
      message: `Files can be at most ${formatBytes(DOCUMENT_FILE_MAX_BYTES)}.`,
    };
  return null;
}

/**
 * Attaches one file to a document through `directUpload` (CM-407): start,
 * the bytes straight to storage (or our route in development), an
 * image's thumbnail, then complete, which records it.
 */
export async function uploadDocumentFile(
  type: ProcurementDocumentType,
  id: string,
  file: File,
  options: UploadOptions = {},
): Promise<DocumentFile> {
  const problem = checkDocumentUpload(file);
  if (problem != null) throw new QueryHttpError(400, problem);
  const base = `${procurementDocumentPath(type, id)}/files`;
  return directUpload({
    startUrl: `${base}/uploads`,
    file,
    options,
    complete: (started, signal) =>
      postJson<DocumentFile>(
        base,
        { key: started.key, fileName: started.fileName },
        signal,
      ),
  });
}

/** Posts a remark or comment with already uploaded files; refreshes the thread. */
export function useAddDocumentRemark(
  type: ProcurementDocumentType,
  id: string,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { body: string; fileIds: string[] }) =>
      postJson<DocumentRemark>(
        `${procurementDocumentPath(type, id)}/remarks`,
        input,
      ),
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: procurementDocumentKey(type, id),
      }),
  });
}

/** Refreshes the files after a remove, and after a 404 (it is gone anyway). */
export function useRemoveDocumentFile(
  type: ProcurementDocumentType,
  id: string,
) {
  const queryClient = useQueryClient();
  const refresh = () =>
    queryClient.invalidateQueries({
      queryKey: procurementDocumentKey(type, id),
    });
  return useMutation({
    mutationFn: (fileId: string) =>
      postJson<undefined>(
        `${procurementDocumentPath(type, id)}/files/${encodeURIComponent(fileId)}/delete`,
        {},
      ),
    onSuccess: refresh,
    onError: (error) =>
      error instanceof QueryHttpError && error.status === 404
        ? refresh()
        : undefined,
  });
}
