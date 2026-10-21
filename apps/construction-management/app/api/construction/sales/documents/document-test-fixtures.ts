import { StatusCodes } from "http-status-codes";
import { expect } from "vitest";

import { TEST_ORIGIN } from "@/test/sessions";

import { POST as completeUpload } from "./[type]/[id]/files/route";
import { POST as receiveUpload } from "./[type]/[id]/files/uploads/app/route";
import { POST as startUpload } from "./[type]/[id]/files/uploads/route";

/**
 * HTTP-test helpers for the sales document files (CM-1003): the browser's
 * upload flow through our routes. Bookings (CM-1006) upload their Booking
 * Form with `uploadSalesFile("booking", id, "booking_form", …)`.
 */

export const SALES_PDF = new TextEncoder().encode(
  "%PDF-1.7\nBooking form\n%%EOF",
);

export function salesDocumentBase(type: string, id: string): string {
  return `${TEST_ORIGIN}/api/construction/sales/documents/${type}/${id}`;
}

export function salesDocumentParams(type: string, id: string) {
  return { params: Promise.resolve({ type, id }) };
}

export function salesFileParams(type: string, id: string, fileId: string) {
  return { params: Promise.resolve({ type, id, fileId }) };
}

export function salesJsonPost(url: string, body: unknown): Request {
  return new Request(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

export type UploadedSalesFile = {
  id: string;
  role: string;
  fileName: string;
  contentType: string;
  url: string;
  thumbUrl: string | null;
  createdBy: string;
  canRemove: boolean;
};

type Started = {
  key: string;
  fileName: string;
  upload: { via: "app"; url: string } | { via: "blob" };
};

/** Starts an upload; the response is returned for tests of refusals. */
export function startSalesUpload(
  type: string,
  id: string,
  role: string,
  fileName: string,
  bytes: number,
): Promise<Response> {
  return startUpload(
    salesJsonPost(`${salesDocumentBase(type, id)}/files/uploads`, {
      role,
      fileName,
      bytes,
    }),
    salesDocumentParams(type, id),
  );
}

/** The browser's flow: start, send, complete. */
export async function uploadSalesFile(
  type: string,
  id: string,
  role: string,
  fileName: string,
  bytes: Uint8Array,
): Promise<UploadedSalesFile> {
  const context = salesDocumentParams(type, id);
  const started = await startSalesUpload(
    type,
    id,
    role,
    fileName,
    bytes.byteLength,
  );
  expect(started.status).toBe(StatusCodes.CREATED);
  const body = (await started.json()) as Started;
  if (body.upload.via !== "app") throw new Error("Expected an app upload");
  const sent = await receiveUpload(
    new Request(`${TEST_ORIGIN}${body.upload.url}`, {
      method: "POST",
      headers: { "content-type": "application/octet-stream" },
      body: Uint8Array.from(bytes),
    }),
    context,
  );
  expect(sent.status).toBe(StatusCodes.NO_CONTENT);
  const done = await completeUpload(
    salesJsonPost(`${salesDocumentBase(type, id)}/files`, {
      role,
      key: body.key,
      fileName: body.fileName,
    }),
    context,
  );
  expect(done.status).toBe(StatusCodes.CREATED);
  return (await done.json()) as UploadedSalesFile;
}
