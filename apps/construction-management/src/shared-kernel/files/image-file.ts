import { DomainError } from "../domain-error";

/** Image types a Company may upload (logos, photos). */
export const IMAGE_CONTENT_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
] as const;

export type ImageContentType = (typeof IMAGE_CONTENT_TYPES)[number];

const EXTENSIONS: Record<ImageContentType, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};

const MB = 1024 * 1024;

/**
 * Size limits per use (`modules/01`: profile photo ≤ 10 MB; ADR CM-0013 §2:
 * Project logo ≤ 2 MB like the Company's).
 */
export const IMAGE_LIMITS = {
  company_logo: 2 * MB,
  member_photo: 10 * MB,
  project_logo: 2 * MB,
} as const;

export type ImageKind = keyof typeof IMAGE_LIMITS;

export type CheckedImage = {
  contentType: ImageContentType;
  extension: string;
  bytes: number;
};

function startsWith(bytes: Uint8Array, signature: readonly number[]): boolean {
  return signature.every((value, index) => bytes[index] === value);
}

/** The image type from the file's first bytes, whatever the client claimed. */
export function sniffImageType(bytes: Uint8Array): ImageContentType | null {
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
    return "image/png";
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return "image/jpeg";
  if (
    startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  )
    return "image/webp";
  return null;
}

export function fileTooLarge(maxBytes: number): DomainError {
  return new DomainError(
    "FILE_TOO_LARGE",
    `The file must be at most ${String(Math.round(maxBytes / MB))} MB.`,
    { details: { maxBytes } },
  );
}

export function fileTypeNotAllowed(): DomainError {
  return new DomainError(
    "FILE_TYPE_NOT_ALLOWED",
    "Choose a PNG, JPEG or WebP image.",
    { details: { allowed: IMAGE_CONTENT_TYPES } },
  );
}

/**
 * Checks an uploaded image: not empty, within the limit for its use, and a
 * PNG, JPEG or WebP by its content (the declared type must agree).
 */
export function checkImage(
  kind: ImageKind,
  bytes: Uint8Array,
  declaredType: string | null,
): CheckedImage {
  if (bytes.byteLength === 0)
    throw new DomainError("FILE_EMPTY", "Choose a file to upload.");
  const maxBytes = IMAGE_LIMITS[kind];
  if (bytes.byteLength > maxBytes) throw fileTooLarge(maxBytes);
  const declared = declaredType?.split(";")[0]?.trim().toLowerCase() ?? "";
  if (!(IMAGE_CONTENT_TYPES as readonly string[]).includes(declared))
    throw fileTypeNotAllowed();
  const sniffed = sniffImageType(bytes);
  if (sniffed == null || sniffed !== declared) throw fileTypeNotAllowed();
  return {
    contentType: sniffed,
    extension: EXTENSIONS[sniffed],
    bytes: bytes.byteLength,
  };
}
