import sharp from "sharp";

import type { ReportStorage } from "../application/ports";
import type { DprImageLoader, PrintableImage } from "./dpr-pdf";

/** Longest side of a printed photo, in pixels: sharp enough for a 3-up grid. */
const PHOTO_PIXELS = 720;
const LOGO_PIXELS = 360;

async function bytesOf(
  stream: ReadableStream<Uint8Array>,
): Promise<Uint8Array> {
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/**
 * Re-encodes any stored image (the browser-made WebP thumbnails, PNG and
 * JPEG originals, the Project logo) as something pdf-lib can embed: photos
 * as JPEG at most 720 px, the logo as PNG to keep its transparency.
 * EXIF orientation is applied. An unreadable image is null, and the PDF
 * prints "Image not available" in its place.
 */
export async function printableImage(
  bytes: Uint8Array,
  use: "logo" | "photo",
): Promise<PrintableImage | null> {
  try {
    const size = use === "logo" ? LOGO_PIXELS : PHOTO_PIXELS;
    const image = sharp(bytes, { failOn: "error" }).rotate().resize({
      width: size,
      height: size,
      fit: "inside",
      withoutEnlargement: true,
    });
    if (use === "logo")
      return {
        bytes: new Uint8Array(await image.png().toBuffer()),
        format: "png",
      };
    return {
      bytes: new Uint8Array(
        await image
          .flatten({ background: "#ffffff" })
          .jpeg({ quality: 72 })
          .toBuffer(),
      ),
      format: "jpeg",
    };
  } catch {
    return null;
  }
}

/** Reads images from the Company's private storage for the DPR. */
export function storageImageLoader(storage: ReportStorage): DprImageLoader {
  return async (ref, use) => {
    const object = await storage.get(ref.key);
    if (object == null) return null;
    return printableImage(await bytesOf(object.body), use);
  };
}
