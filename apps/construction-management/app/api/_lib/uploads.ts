import type { StoredObject } from "@/src/shared-kernel/files";
import { fileTooLarge } from "@/src/shared-kernel/files/image-file";

/**
 * Reads a raw upload body (`content-type: image/png` and the bytes; no
 * multipart, no presigned browser PUT) without holding more than
 * `maxBytes`: a larger `content-length`, or a stream that runs past it, is
 * `FILE_TOO_LARGE`. The type is checked by the command, from the content.
 */
export async function readUpload(
  request: Request,
  maxBytes: number,
): Promise<{ bytes: Uint8Array; contentType: string | null }> {
  const contentType = request.headers.get("content-type");
  const declared = Number(request.headers.get("content-length") ?? "");
  if (Number.isFinite(declared) && declared > maxBytes)
    throw fileTooLarge(maxBytes);
  if (request.body == null) return { bytes: new Uint8Array(), contentType };

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw fileTooLarge(maxBytes);
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return { bytes, contentType };
}

/**
 * Streams a stored image to a signed-in Team Member. Private to the
 * browser; the URL carries the file's version, so a replaced image is a new
 * URL and the old one can be cached.
 */
export function imageResponse(object: StoredObject): Response {
  const headers = new Headers({
    "content-type": object.contentType,
    "cache-control": "private, max-age=86400",
    "x-content-type-options": "nosniff",
    "content-security-policy": "default-src 'none'",
  });
  if (object.contentLength != null)
    headers.set("content-length", String(object.contentLength));
  return new Response(object.body, { headers });
}

/** `content-disposition` with a UTF-8 file name (RFC 6266). */
export function contentDisposition(
  kind: "inline" | "attachment",
  fileName: string,
): string {
  const ascii = fileName.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
  // `'`, `(`, `)` and `*` are not allowed bare in `filename*` (RFC 8187).
  const encoded = encodeURIComponent(fileName).replace(
    /['()*]/g,
    (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
  );
  return `${kind}; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}
