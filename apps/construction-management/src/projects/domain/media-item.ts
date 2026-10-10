/**
 * The Gallery index (ADR CM-0014): one row per image or PDF attached
 * anywhere in a Project. The projects context writes the rows of its own
 * files in their transactions; other contexts' files arrive through
 * `ProjectMediaAttached` / `ProjectMediaRemoved`.
 */
export type MediaItem = {
  id: string;
  workspaceId: string;
  projectId: string;
  /** The owning module (`MEDIA_SOURCES` in M4; later contexts add theirs). */
  source: string;
  /** The owning record: a document, a drawing, a testing report … */
  sourceId: string;
  fileKey: string;
  thumbKey: string | null;
  fileName: string;
  contentType: string;
  bytes: number;
  uploadedBy: string;
  uploadedAt: Date;
};

/** A new Gallery row; the store gives it its id. */
export type NewMediaItem = Omit<MediaItem, "id">;

/**
 * Sources the projects context writes itself in M4. The Gallery accepts
 * any source string so later modules (worksheets, issues, inspections)
 * need no change here.
 */
export const MEDIA_SOURCES = ["document", "drawing", "testing_report"] as const;

export type ProjectMediaSource = (typeof MEDIA_SOURCES)[number];

/** `image` or `pdf`: the Gallery's type filter. */
export type MediaType = "image" | "pdf";

export function mediaTypeOf(contentType: string): MediaType {
  return contentType === "application/pdf" ? "pdf" : "image";
}
