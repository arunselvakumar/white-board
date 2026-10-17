import {
  queryOptions,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";

import type {
  ConstructionSalesDocumentFileResponse,
  ListConstructionSalesDocumentFilesResponse,
} from "@/app/api/construction/sales/documents/document-models";
import { formatBytes } from "@/lib/project-documents";
import {
  SALES_FILE_MAX_BYTES,
  SALES_FILE_ROLE_RULES,
  type SalesDocumentType,
  type SalesFileRole,
} from "@/src/sales/domain/document-files";
import { isProgramName } from "@/src/shared-kernel/attachments/program-names";
import { acceptedExtensions } from "@/src/shared-kernel/attachments/upload-policy";
import { fileExtension } from "@/src/shared-kernel/files/file-name";

import { directUpload, postJson, type UploadOptions } from "./direct-upload";
import { apiJson, QueryHttpError } from "./http";
import { SALES_API, SALES_KEY } from "./sales-access";

export type SalesDocumentFile = ConstructionSalesDocumentFileResponse;
export type SalesDocumentFiles = ListConstructionSalesDocumentFilesResponse;

export { SALES_FILE_ROLE_RULES };

/** `/api/construction/sales/documents/{type}/{id}` (CM-1003). */
export function salesDocumentPath(type: SalesDocumentType, id: string): string {
  return `${SALES_API}/documents/${type}/${encodeURIComponent(id)}`;
}

/** Every key of one document's files. */
export function salesDocumentKey(type: SalesDocumentType, id: string) {
  return [...SALES_KEY, "documents", type, id] as const;
}

/** The document's live files with their roles, oldest first. */
export function salesFilesQuery(type: SalesDocumentType, id: string) {
  return queryOptions({
    queryKey: [...salesDocumentKey(type, id), "files"] as const,
    queryFn: () =>
      apiJson<SalesDocumentFiles>(`${salesDocumentPath(type, id)}/files`),
  });
}

/** The `accept` of a role's file input. */
export function salesFileInputAccept(role: SalesFileRole): string {
  return SALES_FILE_ROLE_RULES[role].accept === "images"
    ? "image/png,image/jpeg,image/webp"
    : "application/pdf,image/png,image/jpeg,image/webp";
}

/** "Photos (PNG, JPEG or WebP), up to 25 MB each." */
export function salesFileHint(role: SalesFileRole): string {
  const size = formatBytes(SALES_FILE_MAX_BYTES);
  return SALES_FILE_ROLE_RULES[role].accept === "images"
    ? `A photo (PNG, JPEG or WebP), up to ${size}.`
    : `A PDF or a photo (PNG, JPEG or WebP), up to ${size}.`;
}

export type SalesFileProblem = {
  code: "FILE_TYPE_NOT_ALLOWED" | "FILE_TOO_LARGE" | "FILE_EMPTY";
  message: string;
};

/** What the browser can refuse before any byte moves; null when it may go up. */
export function checkSalesFile(
  role: SalesFileRole,
  file: { name: string; size: number },
): SalesFileProblem | null {
  const accept = SALES_FILE_ROLE_RULES[role].accept;
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
          ? "Only a photo (PNG, JPEG or WebP) can be added here."
          : "Only a PDF or a photo (PNG, JPEG or WebP) can be added here.",
    };
  if (file.size === 0)
    return { code: "FILE_EMPTY", message: "This file is empty." };
  if (file.size > SALES_FILE_MAX_BYTES)
    return {
      code: "FILE_TOO_LARGE",
      message: `Files can be at most ${formatBytes(SALES_FILE_MAX_BYTES)}.`,
    };
  return null;
}

/** Uploads one file of `role` to an inquiry or booking (start, bytes, complete). */
export async function uploadSalesFile(
  type: SalesDocumentType,
  id: string,
  role: SalesFileRole,
  file: File,
  options: UploadOptions = {},
): Promise<SalesDocumentFile> {
  const problem = checkSalesFile(role, file);
  if (problem != null) throw new QueryHttpError(400, problem);
  const base = `${salesDocumentPath(type, id)}/files`;
  return directUpload({
    startUrl: `${base}/uploads`,
    startBody: { role },
    file,
    options,
    complete: (started, signal) =>
      postJson<SalesDocumentFile>(
        base,
        { role, key: started.key, fileName: started.fileName },
        signal,
      ),
  });
}

/** Removes a file; refreshes the document's files. */
export function useRemoveSalesFile(type: SalesDocumentType, id: string) {
  const queryClient = useQueryClient();
  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: salesDocumentKey(type, id) });
  return useMutation({
    mutationFn: (fileId: string) =>
      postJson<undefined>(
        `${salesDocumentPath(type, id)}/files/${encodeURIComponent(fileId)}/delete`,
        {},
      ),
    onSuccess: refresh,
    onError: (error) =>
      error instanceof QueryHttpError && error.status === 404
        ? refresh()
        : undefined,
  });
}
