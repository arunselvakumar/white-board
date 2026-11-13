import {
  MULTIPART_FROM_BYTES,
  type UploadPolicy,
} from "@/src/shared-kernel/attachments/upload-policy";
import {
  conflict,
  DomainError,
  notFound,
} from "@/src/shared-kernel/domain-error";

import { invalidField } from "./marketing-errors";
import { optionalText } from "./prospect-company";

const MB = 1024 * 1024;

/** Key folder: `companies/<workspaceId>/marketing_visit/<visitId>/…`. */
export const VISIT_FILE_PURPOSE = "marketing_visit";

/** `stored_files.kind` of a Visit's file (and `<kind>_thumbnail`). */
export const VISIT_FILE_KIND = "marketing_visit_file";

/** Live photos and files a Visit keeps (PRD §3.6). */
export const VISIT_FILE_LIMIT = 20;

export const VISIT_CAPTION_MAX = 200;

/**
 * Images and PDFs (a visiting card scan, a brochure, a requirement sheet):
 * images at most 10 MB, PDFs at most 25 MB (ADR CM-0040 §9).
 */
export const VISIT_FILE_POLICY: UploadPolicy = {
  purpose: VISIT_FILE_PURPOSE,
  accept: "pdf_or_image",
  maxBytes: 25 * MB,
  maxBytesByKind: { image: 10 * MB, pdf: 25 * MB },
  multipartFromBytes: MULTIPART_FROM_BYTES,
};

const KEY_ID =
  /\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.[a-z0-9]+$/;

/** A file's id is the uuid its key was minted with. */
export function visitFileIdOfKey(key: string): string | null {
  return KEY_ID.exec(key)?.[1] ?? null;
}

export function visitFileLimit(): DomainError {
  return new DomainError(
    "VISIT_FILE_LIMIT",
    `A Visit keeps up to ${String(VISIT_FILE_LIMIT)} photos and files. Remove one to add another.`,
    { kind: "conflict" },
  );
}

export function visitFileNotFound(): DomainError {
  return notFound("VISIT_FILE_NOT_FOUND", "This file was not found.");
}

/** A thumbnail sent for a file already saved on the Visit. */
export function visitFileAlreadySaved(): DomainError {
  return conflict(
    "VISIT_FILE_ALREADY_SAVED",
    "This file is already saved on the Visit, so its thumbnail cannot be sent again.",
  );
}

export function visitThumbnailNotFound(): DomainError {
  return notFound("THUMBNAIL_NOT_FOUND", "This file has no thumbnail.");
}

/** A caption: trimmed, at most 200 characters; empty is none. */
export function visitFileCaption(
  raw: string | null | undefined,
): string | null {
  const caption = optionalText(raw);
  if (caption != null && caption.length > VISIT_CAPTION_MAX)
    throw invalidField(
      "VISIT_FILE_CAPTION_TOO_LONG",
      `Keep the caption to ${String(VISIT_CAPTION_MAX)} characters.`,
      "caption",
    );
  return caption;
}
