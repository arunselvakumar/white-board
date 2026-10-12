import { StatusCodes } from "http-status-codes";
import { expect } from "vitest";

import { TEST_ORIGIN } from "@/test/sessions";

import { POST as completeUpload } from "./[type]/[id]/files/route";
import { POST as receiveUpload } from "./[type]/[id]/files/uploads/app/route";
import { POST as startUpload } from "./[type]/[id]/files/uploads/route";
import { POST as sendThumbnail } from "./[type]/[id]/files/uploads/thumbnail/route";

/**
 * HTTP-test helpers for the finance documents' thread and files (M7):
 * the browser's upload flow through our routes. Document rows come from
 * `document-test-rows.ts`; other finance tests may reuse `uploadFile`.
 */

export const PDF = new TextEncoder().encode("%PDF-1.7\nCement bill\n%%EOF");
/** A RIFF/WEBP header: the app sniffs only the signature. */
export const WEBP = Uint8Array.from([
  0x52, 0x49, 0x46, 0x46, 0x24, 0, 0, 0, 0x57, 0x45, 0x42, 0x50, 0x56, 0x50,
  0x38, 0x20,
]);
/** An xlsx is a zip. */
export const XLSX = Uint8Array.from([
  0x50, 0x4b, 0x03, 0x04, 0x14, 0, 0, 0, 8, 0,
]);
export const EXE = Uint8Array.from([0x4d, 0x5a, 0x90, 0, 3, 0, 0, 0, 4, 0]);

export function documentBase(type: string, id: string): string {
  return `${TEST_ORIGIN}/api/construction/finance/documents/${type}/${id}`;
}

export function documentParams(type: string, id: string) {
  return { params: Promise.resolve({ type, id }) };
}

export function fileParams(type: string, id: string, fileId: string) {
  return { params: Promise.resolve({ type, id, fileId }) };
}

export function jsonPost(url: string, cookie: string, body: unknown): Request {
  return new Request(url, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify(body),
  });
}

export function get(url: string, cookie: string): Request {
  return new Request(url, { headers: { cookie } });
}

function raw(cookie: string, url: string, bytes: Uint8Array, type: string) {
  return new Request(`${TEST_ORIGIN}${url}`, {
    method: "POST",
    headers: { "content-type": type, cookie },
    body: Uint8Array.from(bytes),
  });
}

export type UploadedFile = {
  id: string;
  remarkId: string | null;
  fileName: string;
  contentType: string;
  bytes: number;
  viewable: boolean;
  url: string;
  thumbUrl: string | null;
  createdBy: string;
  createdByName: string | null;
  canRemove: boolean;
};

type Started = {
  key: string;
  fileName: string;
  upload: { via: "app"; url: string } | { via: "blob" };
  thumbnailUrl: string;
};

/** The browser's flow through the app: start, send, maybe a thumbnail, complete. */
export async function uploadFile(
  cookie: string,
  type: string,
  id: string,
  fileName: string,
  bytes: Uint8Array,
  options: { thumbnail?: Uint8Array } = {},
): Promise<UploadedFile> {
  const context = documentParams(type, id);
  const started = await startUpload(
    jsonPost(`${documentBase(type, id)}/files/uploads`, cookie, {
      fileName,
      bytes: bytes.byteLength,
    }),
    context,
  );
  expect(started.status).toBe(StatusCodes.CREATED);
  const body = (await started.json()) as Started;
  if (body.upload.via !== "app") throw new Error("Expected an app upload");
  const sent = await receiveUpload(
    raw(cookie, body.upload.url, bytes, "application/octet-stream"),
    context,
  );
  expect(sent.status).toBe(StatusCodes.NO_CONTENT);
  if (options.thumbnail != null) {
    const thumb = await sendThumbnail(
      raw(cookie, body.thumbnailUrl, options.thumbnail, "image/webp"),
      context,
    );
    expect(thumb.status).toBe(StatusCodes.NO_CONTENT);
  }
  const done = await completeUpload(
    jsonPost(`${documentBase(type, id)}/files`, cookie, {
      key: body.key,
      fileName: body.fileName,
    }),
    context,
  );
  expect(done.status).toBe(StatusCodes.CREATED);
  return (await done.json()) as UploadedFile;
}
