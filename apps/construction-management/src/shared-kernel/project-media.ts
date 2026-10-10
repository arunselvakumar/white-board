import type { DomainEvent } from "./events";

/**
 * The Gallery index's events (ADR CM-0014). A context that keeps images or
 * PDFs on a Project raises `ProjectMediaAttached` in-process once its own
 * record is saved, and `ProjectMediaRemoved` once it is deleted; the
 * projects context's listener writes `construction_projects.media_items`,
 * so no context reads another's tables. The projects context's own files
 * (documents, drawings, testing reports) write the index in their own
 * transactions instead.
 */
export type ProjectMediaAttached = DomainEvent & {
  type: "ProjectMediaAttached";
  projectId: string;
  /** The owning module, e.g. `worksheet`; a Gallery filter value. */
  source: string;
  /** The owning record's id (uuid). */
  sourceId: string;
  fileKey: string;
  thumbKey: string | null;
  fileName: string;
  /** `application/pdf` or an image type; anything else is not indexed. */
  contentType: string;
  bytes: number;
  uploadedBy: string;
  uploadedAt: Date;
};

/**
 * Takes a file out of the Gallery: the one at `fileKey`, or every file of
 * the record when `fileKey` is left out.
 */
export type ProjectMediaRemoved = DomainEvent & {
  type: "ProjectMediaRemoved";
  projectId: string;
  source: string;
  sourceId: string;
  fileKey?: string;
};

/** What the Gallery shows: PDFs and the image types we accept. */
export const GALLERY_CONTENT_TYPES = [
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
] as const;

export function isGalleryContentType(contentType: string): boolean {
  return (GALLERY_CONTENT_TYPES as readonly string[]).includes(contentType);
}

export function isProjectMediaAttached(
  event: DomainEvent,
): event is ProjectMediaAttached {
  return event.type === "ProjectMediaAttached";
}

export function isProjectMediaRemoved(
  event: DomainEvent,
): event is ProjectMediaRemoved {
  return event.type === "ProjectMediaRemoved";
}
