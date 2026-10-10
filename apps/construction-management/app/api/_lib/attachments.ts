import { z } from "zod";

import type { StartedUpload } from "@/src/shared-kernel/attachments";
import type { StoredObject } from "@/src/shared-kernel/files";

import { contentDisposition } from "./uploads";

/**
 * HTTP pieces every owner of direct uploads shares (CM-407, ADR CM-0014):
 * the start response, the presign handshake models, the `?key=` query and
 * how a stored file or thumbnail is streamed back.
 */

/** Step 1's answer: where the bytes go, and where an image's thumbnail goes. */
export function startUploadResponseModel() {
  return z.object({
    key: z
      .string()
      .describe("Where the file goes; send it back to finish the upload."),
    fileName: z.string().describe("The name as it will be shown."),
    upload: z.discriminatedUnion("via", [
      z
        .object({
          via: z.literal("blob"),
          handleUploadUrl: z.string(),
          multipart: z.boolean(),
        })
        .describe(
          "Deployed: the browser sends the file straight to private storage with `uploadPresigned(key, file, { access: 'private', handleUploadUrl, multipart })` from `@vercel/blob/client`.",
        ),
      z
        .object({ via: z.literal("app"), url: z.string() })
        .describe(
          "Development and tests: POST the raw file to `url` with its content-type.",
        ),
    ]),
    thumbnailUrl: z
      .string()
      .optional()
      .describe(
        "For an image: POST a WebP thumbnail (≤ 480 px on its longer side, ≤ 300 KB) here after sending the file and before finishing; finishing records it. Optional — skip it when the browser cannot make one.",
      ),
  });
}

export type StartUploadResponse = z.infer<
  ReturnType<typeof startUploadResponseModel>
>;

/**
 * Step 1's answer for `uploadsBase` (the route that started it): Blob's
 * presign route when deployed, our `app` route with files on disk.
 */
export function startUploadResponse(
  started: StartedUpload,
  uploadsBase: string,
): StartUploadResponse {
  const key = encodeURIComponent(started.key);
  return {
    key: started.key,
    fileName: started.fileName,
    upload:
      started.upload.via === "blob"
        ? {
            via: "blob",
            handleUploadUrl: `${uploadsBase}/presign`,
            multipart: started.upload.multipart,
          }
        : { via: "app", url: `${uploadsBase}/app?key=${key}` },
    thumbnailUrl: `${uploadsBase}/thumbnail?key=${key}`,
  };
}

/** `?key=` on the app and thumbnail routes. */
export const UploadKeyQueryModel = z.object({
  key: z.string().min(1).describe("The `key` from starting the upload."),
});

/** `?download=1` on a file route. */
export const FileDownloadQueryModel = z.object({
  download: z
    .enum(["1"])
    .optional()
    .describe("`1` saves the file instead of showing it."),
});

/** The `uploadPresigned()` handshake body from `@vercel/blob/client`. */
export function presignUploadRequestModel() {
  return z.object({
    type: z.literal("blob.generate-presigned-url"),
    payload: z.object({
      pathname: z.string().describe("The `key` from starting the upload."),
      multipart: z.boolean(),
      clientPayload: z.string().nullable(),
    }),
  });
}

export function presignUploadResponseModel() {
  return z.object({
    type: z.literal("blob.generate-presigned-url"),
    presignedUrlPayload: z.object({
      delegationToken: z.string(),
      signature: z.string(),
      params: z.record(z.string(), z.string()),
    }),
  });
}

/** Types a file route may answer with. */
export const FILE_CONTENT_TYPES = [
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
  "application/octet-stream",
];

/**
 * Streams a stored file with the type we sniffed when it was recorded,
 * never the one storage or the uploader claimed. A PDF or an image is
 * shown (`inline`) unless `download`; anything else always downloads.
 *
 * CSP: `default-src 'none'` stops any script or subresource in the file.
 * Checked in Chrome 154: its PDF viewer still renders an inline PDF under
 * it, opened directly and in an iframe on our page. `sandbox` is left off
 * shown files because it has broken Chrome's PDF viewer before (and still
 * blanks its thumbnails); `frame-ancestors 'self'` lets only our own pages
 * embed them. A download is never rendered, so it also gets `sandbox`.
 */
export function storedFileResponse(
  file: { contentType: string; fileName: string; viewable: boolean },
  object: StoredObject,
  download: boolean,
): Response {
  const inline = file.viewable && !download;
  const headers = new Headers({
    "content-type": file.contentType,
    "content-disposition": contentDisposition(
      inline ? "inline" : "attachment",
      file.fileName,
    ),
    // Never reused from the browser cache: a deleted file, or another
    // Team Member signing in on a shared site tablet, must hit the access
    // checks again.
    "cache-control": "private, no-store",
    "x-content-type-options": "nosniff",
    "content-security-policy": inline
      ? "default-src 'none'; frame-ancestors 'self'"
      : "default-src 'none'; sandbox",
  });
  if (object.contentLength != null)
    headers.set("content-length", String(object.contentLength));
  return new Response(object.body, { headers });
}

/**
 * Streams a browser-made WebP thumbnail. Its key never changes for the
 * file it shows, so the browser may keep it for a short while; access is
 * checked again after that.
 */
export function thumbnailResponse(object: StoredObject): Response {
  const headers = new Headers({
    "content-type": "image/webp",
    "cache-control": "private, max-age=300",
    "x-content-type-options": "nosniff",
    "content-security-policy": "default-src 'none'",
  });
  if (object.contentLength != null)
    headers.set("content-length", String(object.contentLength));
  return new Response(object.body, { headers });
}
