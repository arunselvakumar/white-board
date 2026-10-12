import {
  queryOptions,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";

import type {
  ConstructionFinanceDocumentFileResponseModel,
  ConstructionFinanceRemarkResponseModel,
  ListConstructionFinanceDocumentFilesResponseModel,
  ListConstructionFinanceRemarksResponseModel,
} from "@/app/api/construction/finance/documents/document-models";
import { formatBytes } from "@/lib/project-documents";
import {
  FINANCE_DOCUMENT_FILES_MAX,
  FINANCE_FILE_ACCEPT,
  FINANCE_FILE_MAX_BYTES,
  FINANCE_REMARK_FILES_MAX,
  type FinanceDocumentType,
} from "@/src/finance/domain/finance-documents";
import { isProgramName } from "@/src/shared-kernel/attachments/program-names";
import { acceptedExtensions } from "@/src/shared-kernel/attachments/upload-policy";
import { fileExtension } from "@/src/shared-kernel/files/file-name";

import { directUpload, postJson, type UploadOptions } from "./direct-upload";
import { FINANCE_API, FINANCE_KEY } from "./finance-access";
import { apiJson, QueryHttpError } from "./http";

export type FinanceRemark = ConstructionFinanceRemarkResponseModel;
export type FinanceRemarks = ListConstructionFinanceRemarksResponseModel;
export type FinanceDocumentFile = ConstructionFinanceDocumentFileResponseModel;
export type FinanceDocumentFiles =
  ListConstructionFinanceDocumentFilesResponseModel;

export { FINANCE_DOCUMENT_FILES_MAX, FINANCE_REMARK_FILES_MAX };

/** `/api/construction/finance/documents/{type}/{id}` (M7). */
export function financeDocumentPath(
  type: FinanceDocumentType,
  id: string,
): string {
  return `${FINANCE_API}/documents/${type}/${encodeURIComponent(id)}`;
}

/**
 * Every key of one document's thread and files. A document's own
 * mutations may invalidate it with
 * `queryClient.invalidateQueries({ queryKey: financeDocumentKey(type, id) })`.
 */
export function financeDocumentKey(type: FinanceDocumentType, id: string) {
  return [...FINANCE_KEY, "documents", type, id] as const;
}

/** The remarks thread, oldest first. */
export function financeRemarksQuery(type: FinanceDocumentType, id: string) {
  return queryOptions({
    queryKey: [...financeDocumentKey(type, id), "remarks"] as const,
    queryFn: () =>
      apiJson<FinanceRemarks>(`${financeDocumentPath(type, id)}/remarks`),
  });
}

/** The document's live files, oldest first (remarks' files included). */
export function financeFilesQuery(type: FinanceDocumentType, id: string) {
  return queryOptions({
    queryKey: [...financeDocumentKey(type, id), "files"] as const,
    queryFn: () =>
      apiJson<FinanceDocumentFiles>(`${financeDocumentPath(type, id)}/files`),
  });
}

/** The `accept` of a file input on a finance document. */
export const FINANCE_FILE_INPUT_ACCEPT =
  "application/pdf,image/png,image/jpeg,image/webp";

/** "PDF or photos (PNG, JPEG or WebP), up to 25 MB each." */
export function financeFileHint(): string {
  return `PDF or photos (PNG, JPEG or WebP), up to ${formatBytes(FINANCE_FILE_MAX_BYTES)} each.`;
}

export type FinanceFileProblem = {
  code: "FILE_TYPE_NOT_ALLOWED" | "FILE_TOO_LARGE" | "FILE_EMPTY";
  message: string;
};

/**
 * What the browser can refuse before any byte moves (the server checks
 * again, by content); null when the file may go up.
 */
export function checkFinanceFile(file: {
  name: string;
  size: number;
}): FinanceFileProblem | null {
  const allowed = acceptedExtensions(FINANCE_FILE_ACCEPT) ?? [];
  const extension = fileExtension(file.name);
  if (
    isProgramName(file.name) ||
    extension == null ||
    !allowed.includes(extension)
  )
    return {
      code: "FILE_TYPE_NOT_ALLOWED",
      message: "Only a PDF or a photo (PNG, JPEG or WebP) can be added here.",
    };
  if (file.size === 0)
    return { code: "FILE_EMPTY", message: "This file is empty." };
  if (file.size > FINANCE_FILE_MAX_BYTES)
    return {
      code: "FILE_TOO_LARGE",
      message: `Files can be at most ${formatBytes(FINANCE_FILE_MAX_BYTES)}.`,
    };
  return null;
}

/**
 * Attaches one file to a finance document through `directUpload`
 * (CM-407): start, the bytes straight to storage (or our route in
 * development), an image's thumbnail, then complete, which records it.
 */
export async function uploadFinanceFile(
  type: FinanceDocumentType,
  id: string,
  file: File,
  options: UploadOptions = {},
): Promise<FinanceDocumentFile> {
  const problem = checkFinanceFile(file);
  if (problem != null) throw new QueryHttpError(400, problem);
  const base = `${financeDocumentPath(type, id)}/files`;
  return directUpload({
    startUrl: `${base}/uploads`,
    file,
    options,
    complete: (started, signal) =>
      postJson<FinanceDocumentFile>(
        base,
        { key: started.key, fileName: started.fileName },
        signal,
      ),
  });
}

/** Posts a remark with already uploaded files; refreshes the thread. */
export function useAddFinanceRemark(type: FinanceDocumentType, id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { body: string; fileIds: string[] }) =>
      postJson<FinanceRemark>(
        `${financeDocumentPath(type, id)}/remarks`,
        input,
      ),
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: financeDocumentKey(type, id),
      }),
  });
}

/** Refreshes the files after a remove, and after a 404 (it is gone anyway). */
export function useRemoveFinanceFile(type: FinanceDocumentType, id: string) {
  const queryClient = useQueryClient();
  const refresh = () =>
    queryClient.invalidateQueries({
      queryKey: financeDocumentKey(type, id),
    });
  return useMutation({
    mutationFn: (fileId: string) =>
      postJson<undefined>(
        `${financeDocumentPath(type, id)}/files/${encodeURIComponent(fileId)}/delete`,
        {},
      ),
    onSuccess: refresh,
    onError: (error) =>
      error instanceof QueryHttpError && error.status === 404
        ? refresh()
        : undefined,
  });
}
