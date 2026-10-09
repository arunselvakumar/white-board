import {
  queryOptions,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { uploadPresigned } from "@vercel/blob/client";

import type {
  ConstructionProjectsDocumentResponseModel,
  ListConstructionProjectsDocumentsResponseModel,
  StartConstructionProjectsDocumentUploadResponseModel,
} from "@/app/api/construction/projects/projects/[id]/documents/project-document-models";
import { checkDocumentFile } from "@/lib/project-documents";
import type { ProjectDocumentKind } from "@/src/projects/domain/project-document-rules";

import { apiJson, QueryHttpError, type ErrorEnvelope } from "./http";
import { PROJECTS_API, PROJECTS_KEY } from "./projects";

export type ProjectDocument = ConstructionProjectsDocumentResponseModel;
export type ProjectDocumentList =
  ListConstructionProjectsDocumentsResponseModel;
type StartedUpload = StartConstructionProjectsDocumentUploadResponseModel;

/** `/api/construction/projects/projects/{id}/documents` (CM-414). */
export function projectDocumentsPath(projectId: string): string {
  return `${PROJECTS_API}/${encodeURIComponent(projectId)}/documents`;
}

/** Under the Project keys, so saving a Project refreshes its files too. */
export function projectDocumentsKey(projectId: string) {
  return [...PROJECTS_KEY, "documents", projectId] as const;
}

/** The Project's files, newest first, and the bytes they take. */
export function projectDocumentsQuery(projectId: string) {
  return queryOptions({
    queryKey: projectDocumentsKey(projectId),
    queryFn: () =>
      apiJson<ProjectDocumentList>(projectDocumentsPath(projectId)),
  });
}

/** Bytes that never reached storage: Blob or the network failed. */
export const UPLOAD_FAILED = "UPLOAD_FAILED";

function uploadFailed(): QueryHttpError {
  return new QueryHttpError(0, {
    code: UPLOAD_FAILED,
    message: "Couldn't upload. Try again.",
  });
}

function cancelled(): DOMException {
  return new DOMException("The upload was cancelled.", "AbortError");
}

export function isUploadCancelled(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

/** What an error says on screen: the server's message, else `fallback`. */
export function uploadErrorMessage(
  error: unknown,
  fallback = "Couldn't upload. Try again.",
): string {
  if (error instanceof QueryHttpError) return error.message;
  return fallback;
}

function envelopeFrom(text: string, fallback: string): ErrorEnvelope {
  try {
    const body: unknown = JSON.parse(text);
    if (
      typeof body === "object" &&
      body !== null &&
      "code" in body &&
      "message" in body &&
      typeof body.code === "string" &&
      typeof body.message === "string"
    )
      return { code: body.code, message: body.message };
  } catch {
    // Not JSON; fall through.
  }
  return { code: "http_error", message: fallback || "Request failed" };
}

export type UploadOptions = {
  /** 0–100 while the bytes go up. */
  onProgress?: (percentage: number) => void;
  signal?: AbortSignal;
};

/**
 * Step 2 in development and tests: the raw file to our own route. XHR, not
 * fetch, because only XHR reports upload progress.
 */
function sendThroughApp(
  url: string,
  file: File,
  { onProgress, signal }: UploadOptions,
): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted === true) {
      reject(cancelled());
      return;
    }
    const xhr = new XMLHttpRequest();
    const abort = () => {
      xhr.abort();
    };
    const settle = () => signal?.removeEventListener("abort", abort);
    xhr.open("POST", url);
    xhr.setRequestHeader(
      "content-type",
      file.type || "application/octet-stream",
    );
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && event.total > 0)
        onProgress?.(Math.round((event.loaded / event.total) * 100));
    };
    xhr.onload = () => {
      settle();
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else
        reject(
          new QueryHttpError(
            xhr.status,
            envelopeFrom(xhr.responseText, xhr.statusText),
          ),
        );
    };
    xhr.onerror = () => {
      settle();
      reject(uploadFailed());
    };
    xhr.onabort = () => {
      settle();
      reject(cancelled());
    };
    signal?.addEventListener("abort", abort, { once: true });
    xhr.send(file);
  });
}

function postJson<T>(
  url: string,
  body: unknown,
  signal?: AbortSignal,
): Promise<T> {
  return apiJson<T>(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
}

/**
 * Keeps one file on a Project (ADR CM-0010): start (the server checks name,
 * size, count and plan), send the bytes straight to private Blob — or to
 * our route in development — then complete, which records the document.
 * A program or a file over 25 MB fails here without a request. Errors are
 * `QueryHttpError` with the server's code; a cancelled upload rejects with
 * an `AbortError`.
 */
export async function uploadProjectDocument(
  projectId: string,
  file: File,
  kind: ProjectDocumentKind,
  options: UploadOptions = {},
): Promise<ProjectDocument> {
  const problem = checkDocumentFile(file);
  if (problem != null) throw new QueryHttpError(400, problem);
  const base = projectDocumentsPath(projectId);
  const { signal, onProgress } = options;

  const started = await postJson<StartedUpload>(
    `${base}/uploads`,
    { kind, fileName: file.name, bytes: file.size },
    signal,
  );
  onProgress?.(0);
  if (started.upload.via === "blob") {
    try {
      await uploadPresigned(started.key, file, {
        access: "private",
        handleUploadUrl: started.upload.handleUploadUrl,
        multipart: started.upload.multipart,
        abortSignal: signal,
        onUploadProgress: ({ percentage }) => {
          onProgress?.(Math.round(percentage));
        },
      });
    } catch {
      if (signal?.aborted === true) throw cancelled();
      throw uploadFailed();
    }
  } else {
    await sendThroughApp(started.upload.url, file, options);
  }
  onProgress?.(100);
  return postJson<ProjectDocument>(
    base,
    { key: started.key, kind, fileName: started.fileName },
    signal,
  );
}

export function deleteProjectDocument(
  projectId: string,
  documentId: string,
): Promise<void> {
  return postJson<undefined>(
    `${projectDocumentsPath(projectId)}/${encodeURIComponent(documentId)}/delete`,
    {},
  );
}

export type UploadProjectDocumentInput = {
  file: File;
  kind: ProjectDocumentKind;
} & UploadOptions;

/** One upload per `mutateAsync` call; several may run at once. */
export function useUploadProjectDocument(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ file, kind, ...options }: UploadProjectDocumentInput) =>
      uploadProjectDocument(projectId, file, kind, options),
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: projectDocumentsKey(projectId),
      }),
  });
}

/** Refreshes the list after a delete, and after a 404 (it is gone anyway). */
export function useDeleteProjectDocument(projectId: string) {
  const queryClient = useQueryClient();
  const refresh = () =>
    queryClient.invalidateQueries({
      queryKey: projectDocumentsKey(projectId),
    });
  return useMutation({
    mutationFn: (documentId: string) =>
      deleteProjectDocument(projectId, documentId),
    onSuccess: refresh,
    onError: (error) =>
      error instanceof QueryHttpError && error.status === 404
        ? refresh()
        : undefined,
  });
}
