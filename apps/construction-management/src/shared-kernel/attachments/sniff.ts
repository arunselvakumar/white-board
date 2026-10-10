import { isProgram } from "../files/executable-file";
import { fileExtension } from "../files/file-name";
import { sniffImageType } from "../files/image-file";
import type { UploadAccept } from "./upload-policy";

/** What a file is by its first bytes. */
export type SniffedKind = "pdf" | "image" | "dwg" | "dxf" | "program" | "other";

export type Sniffed = {
  kind: SniffedKind;
  /**
   * The type we serve it as: a PDF or an image is shown in the browser;
   * anything else, DWG and DXF included, is `application/octet-stream`
   * and always downloads.
   */
  contentType: string;
};

/** Enough of the file to tell a program, a PDF, an image, a DWG or a DXF. */
export const SNIFF_BYTES = 256;

const OCTET_STREAM = "application/octet-stream";

/** `%PDF-`. */
const PDF_SIGNATURE = [0x25, 0x50, 0x44, 0x46, 0x2d];

function startsWith(bytes: Uint8Array, signature: readonly number[]): boolean {
  return (
    bytes.byteLength >= signature.length &&
    signature.every((value, index) => bytes[index] === value)
  );
}

function isDigit(byte: number | undefined): boolean {
  return byte != null && byte >= 0x30 && byte <= 0x39;
}

/**
 * AutoCAD DWG: the version string `AC10nn` (`AC1015` is AutoCAD 2000,
 * `AC1032` 2018 and later).
 */
export function isDwg(bytes: Uint8Array): boolean {
  return (
    startsWith(bytes, [0x41, 0x43, 0x31, 0x30]) &&
    isDigit(bytes[4]) &&
    isDigit(bytes[5])
  );
}

const BINARY_DXF = new TextEncoder().encode("AutoCAD Binary DXF");

/**
 * DXF is text: group codes and values on alternate lines, starting with a
 * `0` / `SECTION` pair or a `999` comment. Only plain text may come before
 * that; a NUL or other control byte means it is not a DXF. Binary DXF has
 * its own sentinel.
 */
export function isDxf(bytes: Uint8Array): boolean {
  if (startsWith(bytes, [...BINARY_DXF])) return true;
  for (const byte of bytes)
    if (byte < 0x20 && byte !== 0x09 && byte !== 0x0a && byte !== 0x0d)
      return false;
  const text = new TextDecoder("latin1").decode(bytes).trimStart();
  return /^0\s*\r?\n\s*SECTION\b/.test(text) || /^999\s*\r?\n/.test(text);
}

/**
 * What the file is by its content, whatever its name or the client
 * claimed. A DXF has no magic number, so text counts as one only when the
 * name says `.dxf`.
 */
export function sniffUpload(prefix: Uint8Array, fileName: string): Sniffed {
  if (isProgram(prefix)) return { kind: "program", contentType: OCTET_STREAM };
  const image = sniffImageType(prefix);
  if (image != null) return { kind: "image", contentType: image };
  if (startsWith(prefix, PDF_SIGNATURE))
    return { kind: "pdf", contentType: "application/pdf" };
  if (isDwg(prefix)) return { kind: "dwg", contentType: OCTET_STREAM };
  if (fileExtension(fileName) === "dxf" && isDxf(prefix))
    return { kind: "dxf", contentType: OCTET_STREAM };
  return { kind: "other", contentType: OCTET_STREAM };
}

const ACCEPTED_KINDS: Record<UploadAccept, readonly SniffedKind[]> = {
  images: ["image"],
  pdf_or_image: ["pdf", "image"],
  any_but_programs: ["pdf", "image", "dwg", "dxf", "other"],
  drawing: ["pdf", "image", "dwg", "dxf"],
};

/** Whether a policy keeps a file whose content is `kind`. */
export function acceptsContent(
  accept: UploadAccept,
  kind: SniffedKind,
): boolean {
  return ACCEPTED_KINDS[accept].includes(kind);
}

/** A PDF or an image: the browser can show it, and the Gallery indexes it. */
export function isViewableKind(kind: SniffedKind): boolean {
  return kind === "pdf" || kind === "image";
}
