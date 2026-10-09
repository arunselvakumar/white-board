import { DomainError } from "../domain-error";
import {
  IMAGE_CONTENT_TYPES,
  fileTooLarge,
  sniffImageType,
  type ImageContentType,
} from "./image-file";

/** Files kept as "Other Documents": scans and photos of papers. */
export const DOCUMENT_CONTENT_TYPES = [
  ...IMAGE_CONTENT_TYPES,
  "application/pdf",
] as const;

export type DocumentContentType = (typeof DOCUMENT_CONTENT_TYPES)[number];

const EXTENSIONS: Record<DocumentContentType, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "application/pdf": "pdf",
};

/** `%PDF-`. */
const PDF_SIGNATURE = [0x25, 0x50, 0x44, 0x46, 0x2d];

/** The document type from the file's first bytes, whatever the client claimed. */
export function sniffDocumentType(
  bytes: Uint8Array,
): DocumentContentType | null {
  const image: ImageContentType | null = sniffImageType(bytes);
  if (image != null) return image;
  if (PDF_SIGNATURE.every((value, index) => bytes[index] === value))
    return "application/pdf";
  return null;
}

export type CheckedDocument = {
  contentType: DocumentContentType;
  extension: string;
  bytes: number;
};

/**
 * Checks an uploaded document: not empty, at most `maxBytes`, and a PDF,
 * PNG, JPEG or WebP by its content (the declared type must agree).
 */
export function checkDocument(
  bytes: Uint8Array,
  declaredType: string | null,
  maxBytes: number,
): CheckedDocument {
  if (bytes.byteLength === 0)
    throw new DomainError("FILE_EMPTY", "Choose a file to upload.");
  if (bytes.byteLength > maxBytes) throw fileTooLarge(maxBytes);
  const declared = declaredType?.split(";")[0]?.trim().toLowerCase() ?? "";
  const sniffed = sniffDocumentType(bytes);
  if (
    !(DOCUMENT_CONTENT_TYPES as readonly string[]).includes(declared) ||
    sniffed == null ||
    sniffed !== declared
  )
    throw new DomainError(
      "FILE_TYPE_NOT_ALLOWED",
      "Choose a PDF, PNG, JPEG or WebP file.",
      { details: { allowed: DOCUMENT_CONTENT_TYPES } },
    );
  return {
    contentType: sniffed,
    extension: EXTENSIONS[sniffed],
    bytes: bytes.byteLength,
  };
}
