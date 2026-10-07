// Content checks for Study Material, Homework, and Submission files
// (ADR-0033), the same checks Teacher documents use: the bytes must match the
// declared type and decode as a whole PDF or image.

import { PDFDocument } from "pdf-lib";
import sharp from "sharp";

import { ATTACHMENT_MAX_BYTES } from "../domain/class-work";
import { DomainError } from "../domain/errors";
import type { AttachmentMimeType } from "./class-work-views";

const MIME_TYPES: readonly AttachmentMimeType[] = [
  "application/pdf",
  "image/jpeg",
  "image/png",
];

function invalid(message: string): DomainError {
  return new DomainError("ATTACHMENT_FILE_INVALID", message);
}

export function attachmentMimeType(raw: string | null): AttachmentMimeType {
  const mimeType = raw?.split(";")[0]?.trim().toLowerCase() ?? "";
  const match = MIME_TYPES.find((type) => type === mimeType);
  if (match == null)
    throw new DomainError(
      "ATTACHMENT_TYPE_INVALID",
      "Attach a PDF, JPEG, or PNG file.",
    );
  return match;
}

function signatureMatches(
  mimeType: AttachmentMimeType,
  bytes: Buffer,
): boolean {
  if (mimeType === "image/jpeg")
    return (
      bytes.length >= 3 &&
      bytes[0] === 0xff &&
      bytes[1] === 0xd8 &&
      bytes[2] === 0xff
    );
  if (mimeType === "image/png")
    return (
      bytes.length >= 8 &&
      bytes
        .subarray(0, 8)
        .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
    );
  return bytes.length >= 5 && bytes.toString("ascii", 0, 5) === "%PDF-";
}

export async function checkAttachmentFile(
  mimeType: AttachmentMimeType,
  data: Uint8Array,
): Promise<void> {
  if (data.length === 0) throw invalid("The file is empty.");
  if (data.length > ATTACHMENT_MAX_BYTES)
    throw new DomainError(
      "ATTACHMENT_TOO_LARGE",
      "Files must be 4 MB or smaller.",
    );
  const bytes = Buffer.from(data);
  if (!signatureMatches(mimeType, bytes))
    throw invalid("The file's content doesn't match its type.");
  if (mimeType === "application/pdf") {
    try {
      const tail = bytes.toString("latin1", Math.max(0, bytes.length - 1024));
      if (!/%%EOF\s*$/.test(tail)) throw new Error("Missing PDF trailer");
      const pdf = await PDFDocument.load(bytes, {
        throwOnInvalidObject: true,
        updateMetadata: false,
        ignoreEncryption: true,
      });
      if (pdf.getPageCount() === 0) throw new Error("Empty PDF");
    } catch {
      throw invalid("The PDF is incomplete or can't be read.");
    }
    return;
  }
  try {
    const image = sharp(bytes, {
      failOn: "warning",
      limitInputPixels: 40_000_000,
    });
    const metadata = await image.metadata();
    const format = mimeType === "image/png" ? "png" : "jpeg";
    if (
      metadata.format !== format ||
      metadata.width <= 0 ||
      metadata.height <= 0
    )
      throw new Error("Image type mismatch");
    await image.toBuffer();
  } catch {
    throw invalid("The image is incomplete or can't be read.");
  }
}
