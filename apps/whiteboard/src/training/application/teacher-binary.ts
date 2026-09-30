import { DomainError } from "../domain/errors";
import { PDFDocument } from "pdf-lib";
import sharp from "sharp";

export type EncodedTeacherBinary = { mimeType: string; dataBase64: string };

function decode(input: EncodedTeacherBinary, allowed: readonly string[], maxBytes: number): { mimeType: string; bytes: Uint8Array } {
  if (!allowed.includes(input.mimeType)) throw new DomainError("TEACHER_FILE_TYPE_INVALID", "File type is not supported.");
  if (input.dataBase64.length > Math.ceil(maxBytes / 3) * 4 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(input.dataBase64)) {
    throw new DomainError("TEACHER_FILE_INVALID", "File data is invalid or too large.");
  }
  const bytes = Buffer.from(input.dataBase64, "base64");
  if (bytes.length === 0 || bytes.length > maxBytes || bytes.toString("base64") !== input.dataBase64) {
    throw new DomainError("TEACHER_FILE_INVALID", "File data is invalid or too large.");
  }
  const signatures: Record<string, boolean> = {
    "image/jpeg": bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff,
    "image/png": bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])),
    "image/webp": bytes.length >= 12 && bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP",
    "application/pdf": bytes.length >= 5 && bytes.toString("ascii", 0, 5) === "%PDF-",
  };
  if (!signatures[input.mimeType]) throw new DomainError("TEACHER_FILE_INVALID", "File content does not match its type.");
  return { mimeType: input.mimeType, bytes };
}

async function validateImage(mimeType: string, bytes: Uint8Array): Promise<void> {
  try {
    const image = sharp(bytes, { failOn: "warning", limitInputPixels: 40_000_000 });
    const metadata = await image.metadata();
    const format = { "image/jpeg": "jpeg", "image/png": "png", "image/webp": "webp" }[mimeType];
    if (metadata.format !== format || metadata.width <= 0 || metadata.height <= 0) throw new Error("Image type mismatch");
    await image.toBuffer();
  } catch {
    throw new DomainError("TEACHER_FILE_INVALID", "Image data is incomplete or invalid.");
  }
}

export async function decodeTeacherPhoto(input: EncodedTeacherBinary): Promise<{ mimeType: string; bytes: Uint8Array }> {
  const file = decode(input, ["image/jpeg", "image/png", "image/webp"], 2 * 1024 * 1024);
  await validateImage(file.mimeType, file.bytes);
  return file;
}

export async function decodeTeacherDocument(input: EncodedTeacherBinary): Promise<{ mimeType: string; bytes: Uint8Array }> {
  const file = decode(input, ["application/pdf", "image/jpeg", "image/png"], 3 * 1024 * 1024);
  if (file.mimeType !== "application/pdf") {
    await validateImage(file.mimeType, file.bytes);
    return file;
  }
  try {
    const tail = Buffer.from(file.bytes).toString("latin1", Math.max(0, file.bytes.length - 1024));
    if (!/%%EOF\s*$/.test(tail)) throw new Error("Missing PDF trailer");
    const pdf = await PDFDocument.load(file.bytes, { throwOnInvalidObject: true, updateMetadata: false });
    if (pdf.getPageCount() === 0) throw new Error("Empty PDF");
  } catch {
    throw new DomainError("TEACHER_FILE_INVALID", "PDF data is incomplete or invalid.");
  }
  return file;
}
