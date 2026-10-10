import { uploadPresigned } from "@vercel/blob/client";

import type { StartUploadResponse } from "@/app/api/_lib/attachments";
import { isThumbnailSource, makeThumbnail } from "@/lib/thumbnail";

import { apiJson, QueryHttpError, type ErrorEnvelope } from "./http";

/**
 * The browser half of the attachments service (CM-407, ADR CM-0014): start
 * on our route, send the bytes straight to private Blob (or to our route
 * in development), send an image's WebP thumbnail, then complete on the
 * owner's route. Every upload form goes through `directUpload`.
 */

export type StartedDirectUpload = StartUploadResponse;

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

export function postJson<T>(
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
 * An image's WebP thumbnail to `url`, best effort: a browser that can't
 * make one, or a refusal, leaves the file without a thumbnail.
 */
async function sendThumbnail(
  url: string,
  file: File,
  signal?: AbortSignal,
): Promise<void> {
  const thumbnail = await makeThumbnail(file);
  if (thumbnail == null || signal?.aborted === true) return;
  try {
    await fetch(url, {
      method: "POST",
      headers: { "content-type": "image/webp" },
      body: thumbnail,
      signal,
    });
  } catch {
    // No thumbnail is not an error (ADR CM-0014).
  }
}

/**
 * Uploads one file: `POST startUrl` with `{ ...startBody, fileName, bytes }`,
 * the bytes to where the answer says (in parts when it says `multipart`),
 * the thumbnail of an image, then `complete(started)` — the owner's own
 * completion request, which records the file. Errors are `QueryHttpError`
 * with the server's code; a cancelled upload rejects with an `AbortError`.
 */
export async function directUpload<T>(input: {
  startUrl: string;
  startBody?: Record<string, unknown>;
  file: File;
  complete: (started: StartedDirectUpload, signal?: AbortSignal) => Promise<T>;
  options?: UploadOptions;
}): Promise<T> {
  const { file } = input;
  const { signal, onProgress } = input.options ?? {};
  const started = await postJson<StartedDirectUpload>(
    input.startUrl,
    { ...input.startBody, fileName: file.name, bytes: file.size },
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
    await sendThroughApp(started.upload.url, file, input.options ?? {});
  }
  onProgress?.(100);
  if (started.thumbnailUrl != null && isThumbnailSource(file))
    await sendThumbnail(started.thumbnailUrl, file, signal);
  if (signal?.aborted === true) throw cancelled();
  return input.complete(started, signal);
}
