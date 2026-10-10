import { DomainError } from "../domain-error";
import { fileExtension } from "../files/file-name";
import { fileTooLarge } from "../files/image-file";
import { PROGRAM_EXTENSIONS, isProgramName } from "./program-names";

/**
 * What an upload may contain (ADR CM-0014):
 * - `images`: PNG, JPEG or WebP;
 * - `pdf_or_image`: a PDF or one of those images;
 * - `any_but_programs`: anything a program is not;
 * - `drawing`: a PDF, an image, or a CAD file (DWG, DXF).
 */
export const UPLOAD_ACCEPTS = [
  "images",
  "pdf_or_image",
  "any_but_programs",
  "drawing",
] as const;

export type UploadAccept = (typeof UPLOAD_ACCEPTS)[number];

const MB = 1024 * 1024;

/** Files at most this size go up in one request; larger ones in parts (CM-0010). */
export const MULTIPART_FROM_BYTES = 8 * MB;

/**
 * How one purpose uploads: the folder its keys live in, what it accepts,
 * its largest file and where multipart starts. The owning context declares
 * its policies; the kernel applies them.
 */
export type UploadPolicy = {
  /** The key folder: `companies/<workspaceId>/<purpose>/<ownerId>/`. */
  purpose: string;
  accept: UploadAccept;
  maxBytes: number;
  multipartFromBytes: number;
  /** What a refused program is told, in the owner's words. */
  programMessage?: string;
};

/** Extensions each restricted policy accepts by name; null = any but programs. */
const EXTENSIONS: Record<UploadAccept, readonly string[] | null> = {
  images: ["png", "jpg", "jpeg", "webp"],
  pdf_or_image: ["pdf", "png", "jpg", "jpeg", "webp"],
  any_but_programs: null,
  drawing: ["pdf", "png", "jpg", "jpeg", "webp", "dwg", "dxf"],
};

const ACCEPT_WORDS: Record<UploadAccept, string> = {
  images: "Choose a PNG, JPEG or WebP image.",
  pdf_or_image: "Choose a PDF, PNG, JPEG or WebP file.",
  any_but_programs: "Choose a document, a picture, a drawing or a zip.",
  drawing: "Choose a PDF, an image (PNG, JPEG, WebP), a DWG or a DXF file.",
};

/** The extensions a policy accepts by name, or null for any but programs. */
export function acceptedExtensions(
  accept: UploadAccept,
): readonly string[] | null {
  return EXTENSIONS[accept];
}

export function programNotAllowed(policy: UploadPolicy): DomainError {
  return new DomainError(
    "FILE_TYPE_NOT_ALLOWED",
    policy.programMessage ??
      `Programs cannot be uploaded. ${ACCEPT_WORDS.any_but_programs}`,
    { details: { blocked: PROGRAM_EXTENSIONS } },
  );
}

export function typeNotAccepted(policy: UploadPolicy): DomainError {
  return new DomainError("FILE_TYPE_NOT_ALLOWED", ACCEPT_WORDS[policy.accept], {
    details: { allowed: EXTENSIONS[policy.accept] },
  });
}

/**
 * Refuses by name before any byte moves: a program, or for a restricted
 * policy an extension it does not accept.
 */
export function assertNameAccepted(
  policy: UploadPolicy,
  fileName: string,
): void {
  if (isProgramName(fileName)) throw programNotAllowed(policy);
  const allowed = EXTENSIONS[policy.accept];
  if (allowed == null) return;
  const extension = fileExtension(fileName);
  if (extension == null || !allowed.includes(extension))
    throw typeNotAccepted(policy);
}

/** Refuses an empty file or one over the policy's largest. */
export function assertSizeAccepted(policy: UploadPolicy, bytes: number): void {
  if (bytes === 0)
    throw new DomainError("FILE_EMPTY", "Choose a file to upload.");
  if (bytes > policy.maxBytes) throw fileTooLarge(policy.maxBytes);
}
