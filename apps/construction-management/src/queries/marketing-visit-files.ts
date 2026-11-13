import { useMutation, useQueryClient } from "@tanstack/react-query";

import { formatBytes } from "@/lib/project-documents";
import {
  VISIT_FILE_LIMIT,
  VISIT_FILE_POLICY,
} from "@/src/marketing/domain/visit-files";
import {
  assertKindSizeAccepted,
  assertNameAccepted,
  assertSizeAccepted,
  declaredKind,
} from "@/src/shared-kernel/attachments/upload-policy";
import { DomainError } from "@/src/shared-kernel/domain-error";

import { directUpload, postJson, type UploadOptions } from "./direct-upload";
import { QueryHttpError } from "./http";
import { MARKETING_COMPANIES_KEY } from "./marketing-companies";
import {
  MARKETING_VISITS_API,
  visitQuery,
  type Visit,
} from "./marketing-visits";

export type VisitFile = Visit["files"][number];

export { VISIT_FILE_LIMIT };

/** The `accept` of Take photo: the image types the server keeps. */
export const VISIT_PHOTO_ACCEPT = "image/jpeg,image/png,image/webp";

/**
 * The `accept` of the picker: exactly the types the server keeps, so iOS
 * hands over a JPEG rather than a HEIC photo.
 */
export const VISIT_FILE_ACCEPT = `${VISIT_PHOTO_ACCEPT},application/pdf`;

/** What a HEIC photo that still arrives is told. */
export const VISIT_HEIC_MESSAGE =
  "HEIC photos are not supported. Choose a JPEG or PNG.";

const HEIC = /\.(heic|heif)$/i;

/** "Photos up to 10 MB, PDFs up to 25 MB, 20 in all." */
export const VISIT_FILE_HINT = `Photos (PNG, JPEG or WebP) up to ${formatBytes(VISIT_FILE_POLICY.maxBytesByKind?.image ?? VISIT_FILE_POLICY.maxBytes)}, PDFs up to ${formatBytes(VISIT_FILE_POLICY.maxBytesByKind?.pdf ?? VISIT_FILE_POLICY.maxBytes)}. Up to ${String(VISIT_FILE_LIMIT)} on a Visit.`;

export function visitFilesUrl(visitId: string): string {
  return `${MARKETING_VISITS_API}/${encodeURIComponent(visitId)}/files`;
}

/** Streams the file; `?download=1` saves it. */
export function visitFileUrl(visitId: string, fileId: string): string {
  return `${visitFilesUrl(visitId)}/${encodeURIComponent(fileId)}`;
}

/** The file as the shared tiles and viewer take it. */
export function viewableVisitFile(visitId: string, file: VisitFile) {
  const url = visitFileUrl(visitId, file.id);
  return {
    name: file.fileName,
    url,
    contentType: file.contentType,
    thumbUrl: file.hasThumbnail ? `${url}/thumbnail` : null,
  };
}

/** "Photo" for an image, "File" for a PDF, by its name. */
export function visitFileWord(fileName: string): "Photo" | "File" {
  return declaredKind(fileName) === "image" ? "Photo" : "File";
}

export type VisitFileProblem = { code: string; message: string };

/**
 * What the browser can refuse before any byte moves, with the server's own
 * rules and words: a type other than image or PDF (a HEIC photo says so),
 * an empty file, an image over 10 MB or a PDF over 25 MB. Null when it
 * may go up.
 */
export function checkVisitFile(file: {
  name: string;
  size: number;
  type?: string;
}): VisitFileProblem | null {
  if (HEIC.test(file.name) || /^image\/hei[cf]/i.test(file.type ?? ""))
    return { code: "FILE_TYPE_NOT_ALLOWED", message: VISIT_HEIC_MESSAGE };
  try {
    assertNameAccepted(VISIT_FILE_POLICY, file.name);
    assertSizeAccepted(VISIT_FILE_POLICY, file.size);
    assertKindSizeAccepted(
      VISIT_FILE_POLICY,
      declaredKind(file.name),
      file.size,
    );
    return null;
  } catch (error) {
    if (error instanceof DomainError)
      return { code: error.code, message: error.message };
    throw error;
  }
}

/** Uploads one file to a Visit: start, the bytes, the thumbnail, complete. */
export async function uploadVisitFile(
  visitId: string,
  file: File,
  options: UploadOptions = {},
): Promise<VisitFile> {
  const problem = checkVisitFile(file);
  if (problem != null) throw new QueryHttpError(400, problem);
  const base = visitFilesUrl(visitId);
  return directUpload({
    startUrl: `${base}/uploads`,
    file,
    options,
    complete: (started, signal) =>
      postJson<VisitFile>(
        base,
        { key: started.key, fileName: started.fileName },
        signal,
      ),
  });
}

/**
 * Refreshes the Visit (its files and history) and the Prospect Company
 * reads, whose History lists the files. Rejects when the Visit could not
 * be read again, so an upload can say so instead of vanishing.
 */
export function useRefreshVisitFiles(visitId: string) {
  const client = useQueryClient();
  return async (): Promise<void> => {
    await Promise.all([
      client.invalidateQueries(
        { queryKey: visitQuery(visitId).queryKey },
        { throwOnError: true },
      ),
      client.invalidateQueries({ queryKey: MARKETING_COMPANIES_KEY }),
    ]);
  };
}

/**
 * The refresh after a change the server saved. A failed refresh does not
 * fail the change: saying "could not save" would invite saving it twice.
 */
function useRefreshAfterSave(visitId: string) {
  const refresh = useRefreshVisitFiles(visitId);
  return () => refresh().catch(() => undefined);
}

/** Sets or clears a file's caption. */
export function useUpdateVisitFileCaption(visitId: string) {
  const refresh = useRefreshAfterSave(visitId);
  return useMutation({
    mutationFn: (input: { fileId: string; caption: string | null }) =>
      postJson<VisitFile>(`${visitFileUrl(visitId, input.fileId)}/update`, {
        caption: input.caption,
      }),
    onSuccess: refresh,
  });
}

/** Removes a file for everyone; a file already gone refreshes too. */
export function useRemoveVisitFile(visitId: string) {
  const refresh = useRefreshAfterSave(visitId);
  return useMutation({
    mutationFn: (fileId: string) =>
      postJson<undefined>(`${visitFileUrl(visitId, fileId)}/delete`, {}),
    onSuccess: refresh,
    onError: (error) =>
      error instanceof QueryHttpError && error.status === 404
        ? refresh()
        : undefined,
  });
}
