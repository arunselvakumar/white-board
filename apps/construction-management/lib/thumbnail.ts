/**
 * Browser-made thumbnails (ADR CM-0014): a WebP at most 480 px on its
 * longer side and at most 300 KB, drawn from an image before it is
 * recorded. There is no image library on the server, so a browser that
 * cannot decode the image or encode WebP simply sends none; the Gallery
 * then shows the full image.
 */

export const THUMBNAIL_EDGE = 480;
export const THUMBNAIL_BYTES = 300 * 1024;

const IMAGE_NAME = /\.(png|jpe?g|webp)$/i;

/** Whether a picked file is an image the server accepts (PNG, JPEG, WebP). */
export function isThumbnailSource(file: { name: string; type: string }) {
  return (
    ["image/png", "image/jpeg", "image/webp"].includes(file.type) ||
    (file.type === "" && IMAGE_NAME.test(file.name))
  );
}

/** The size to draw at: the longer side at most `edge`, never enlarged. */
export function thumbnailSize(
  width: number,
  height: number,
  edge = THUMBNAIL_EDGE,
): { width: number; height: number } {
  const scale = Math.min(1, edge / Math.max(width, height, 1));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

type Canvas = {
  getContext(type: "2d"): {
    drawImage(
      image: ImageBitmap,
      x: number,
      y: number,
      w: number,
      h: number,
    ): void;
  } | null;
};

function canvasOf(
  width: number,
  height: number,
): {
  canvas: Canvas;
  encode: (quality: number) => Promise<Blob | null>;
} | null {
  if (typeof OffscreenCanvas !== "undefined") {
    const canvas = new OffscreenCanvas(width, height);
    return {
      canvas: canvas as unknown as Canvas,
      encode: (quality) =>
        canvas.convertToBlob({ type: "image/webp", quality }).catch(() => null),
    };
  }
  if (typeof document === "undefined") return null;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return {
    canvas: canvas as unknown as Canvas,
    encode: (quality) =>
      new Promise((resolve) => {
        canvas.toBlob(resolve, "image/webp", quality);
      }),
  };
}

/**
 * A WebP thumbnail of `file`, or null when this browser can't make one
 * (no `createImageBitmap`, no canvas, no WebP encoder — Safari before 17
 * hands back a PNG — or the image would not fit in 300 KB).
 */
export async function makeThumbnail(file: Blob): Promise<Blob | null> {
  try {
    if (typeof createImageBitmap !== "function") return null;
    const bitmap = await createImageBitmap(file);
    try {
      const size = thumbnailSize(bitmap.width, bitmap.height);
      const target = canvasOf(size.width, size.height);
      const context = target?.canvas.getContext("2d");
      if (target == null || context == null) return null;
      context.drawImage(bitmap, 0, 0, size.width, size.height);
      for (const quality of [0.8, 0.6, 0.4]) {
        const blob = await target.encode(quality);
        if (blob?.type !== "image/webp") return null;
        if (blob.size <= THUMBNAIL_BYTES) return blob;
      }
      return null;
    } finally {
      bitmap.close();
    }
  } catch {
    return null;
  }
}
