import { DomainError } from "@/src/shared-kernel/domain-error";

/**
 * Project Drawings (CM-408, ADR CM-0013 §8): albums of drawing sheets,
 * each sheet a series of uploaded revisions R1, R2 … of which the latest
 * is shown.
 */

export const ALBUM_NAME_MAX = 80;
export const DRAWING_NAME_MAX = 120;

/** An album of drawings: Architect, Electrical … or one the Company added. */
export type DrawingAlbum = {
  id: string;
  workspaceId: string;
  projectId: string;
  name: string;
  /** One of the four albums every Project starts with. */
  isSeed: boolean;
  createdAt: Date;
  updatedAt: Date;
};

/** A drawing sheet, as stored. */
export type Drawing = {
  id: string;
  workspaceId: string;
  projectId: string;
  albumId: string;
  name: string;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
};

/** One uploaded file of a drawing. */
export type DrawingRevision = {
  id: string;
  workspaceId: string;
  drawingId: string;
  /** 1, 2, 3 …, shown as R1, R2, R3 … */
  revision: number;
  fileKey: string;
  fileName: string;
  /** What we serve it as: a PDF or image, else octet-stream (DWG, DXF). */
  contentType: string;
  bytes: number;
  thumbKey: string | null;
  createdAt: Date;
  createdBy: string;
};

function cleanName(
  raw: string,
  max: number,
  codes: { required: string; tooLong: string },
  words: string,
): string {
  const name = raw.trim().replace(/\s+/g, " ");
  if (name.length === 0)
    throw new DomainError(codes.required, `Enter the ${words} name.`);
  if (name.length > max)
    throw new DomainError(
      codes.tooLong,
      `The ${words} name can be at most ${String(max)} characters.`,
    );
  return name;
}

/** An album name: required, at most 80 characters, spaces collapsed. */
export function albumName(raw: string): string {
  return cleanName(
    raw,
    ALBUM_NAME_MAX,
    { required: "ALBUM_NAME_REQUIRED", tooLong: "ALBUM_NAME_TOO_LONG" },
    "album",
  );
}

/** A drawing name: required, at most 120 characters, spaces collapsed. */
export function drawingName(raw: string): string {
  return cleanName(
    raw,
    DRAWING_NAME_MAX,
    { required: "DRAWING_NAME_REQUIRED", tooLong: "DRAWING_NAME_TOO_LONG" },
    "drawing",
  );
}

/**
 * The name a new drawing gets when none is typed: the file's name without
 * its extension ("GF Plan R3.dwg" → "GF Plan R3"), cut to fit.
 */
export function drawingNameFromFile(fileName: string): string {
  const base = fileName.replace(/\.[^./\\]{1,10}$/, "").trim();
  const name = (base.length === 0 ? fileName : base).replace(/\s+/g, " ");
  return name.slice(0, DRAWING_NAME_MAX).trim() || "Drawing";
}

/** "R1", "R2" … */
export function revisionLabel(revision: number): string {
  return `R${String(revision)}`;
}
