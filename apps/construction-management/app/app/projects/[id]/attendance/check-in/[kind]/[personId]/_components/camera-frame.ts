/*
 * The arithmetic of a check-in photo (ADR CM-0043 §6), kept apart from the
 * browser so it can be tested as plain functions.
 */

/** Pixels on the photo's longer side, at most. */
export const PHOTO_MAX_SIDE = 1280;

/** The server refuses anything larger. */
export const PHOTO_MAX_BYTES = 1024 * 1024;

/** JPEG qualities tried in turn until the photo fits. */
export const JPEG_QUALITIES = [0.82, 0.72, 0.62, 0.52, 0.42, 0.32] as const;

/** Smaller sizes tried, as a share of the fitted size, when no quality fits. */
const SCALES = [1, 0.75, 0.5] as const;

export type CameraFailure = "denied" | "unavailable" | "in_use" | "error";

export type Facing = "environment" | "user";

/** Why a photo could not be taken, in words for the screen. */
export class CameraCaptureError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CameraCaptureError";
  }
}

/** The frame scaled down (never up) so its longer side is at most `maxSide`. */
export function fitWithin(
  width: number,
  height: number,
  maxSide: number = PHOTO_MAX_SIDE,
): { width: number; height: number } {
  const scale = Math.min(1, maxSide / Math.max(width, height, 1));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

/**
 * Encodes at each quality in turn, then at smaller sizes, and returns the
 * first result of at most `maxBytes`.
 */
export async function encodeWithin(
  encode: (quality: number, scale: number) => Promise<Blob>,
  maxBytes: number = PHOTO_MAX_BYTES,
): Promise<Blob> {
  for (const scale of SCALES)
    for (const quality of JPEG_QUALITIES) {
      const blob = await encode(quality, scale);
      if (blob.size <= maxBytes) return blob;
    }
  throw new CameraCaptureError(
    "The photo came out too large. Try again in better light.",
  );
}

/** What a failed `getUserMedia` means for the operator. */
export function cameraFailureOf(error: unknown): CameraFailure {
  const name =
    typeof error === "object" && error != null && "name" in error
      ? String(error.name)
      : "";
  switch (name) {
    case "NotAllowedError":
    case "SecurityError":
      return "denied";
    case "NotFoundError":
    case "OverconstrainedError":
      return "unavailable";
    case "NotReadableError":
    case "AbortError":
      return "in_use";
    default:
      return "error";
  }
}

const FRONT = /front|user|facetime|selfie|integrated|webcam/i;
const BACK = /back|rear|environment/i;

/** Which way a camera faces by its label, when the label says. */
export function facingOfLabel(label: string | undefined): Facing | null {
  if (label == null) return null;
  if (BACK.test(label)) return "environment";
  if (FRONT.test(label)) return "user";
  return null;
}

/**
 * Which way a camera faces: what the track reports, else what its label
 * says, else `fallback` (what was asked for).
 */
export function facingOf(
  reported: string | undefined,
  label: string | undefined,
  fallback: Facing,
): Facing {
  if (reported === "user" || reported === "environment") return reported;
  return facingOfLabel(label) ?? fallback;
}

/** The base64 of a data URL, without its `data:…;base64,` prefix. */
export function base64OfDataUrl(dataUrl: string): string {
  const comma = dataUrl.indexOf(",");
  return comma < 0 ? dataUrl : dataUrl.slice(comma + 1);
}
