import type { TrackingDocumentFileView } from "@/src/tracking/application/document-files";
import {
  trackingFileIdOfKey,
  type TrackingDocumentFile,
} from "@/src/tracking/domain/document-files";
import {
  TRACKING_DOCUMENTS,
  TRACKING_DOCUMENT_TYPES,
  type TrackingDocumentType,
} from "@/src/tracking/domain/tracking-documents";

import {
  TRACKING_DOCUMENTS_PATH,
  type ConstructionTrackingDocumentFileResponseModel,
} from "./document-models";

/** `/api/construction/tracking/documents/{type}/{id}`. */
export function trackingDocumentPath(
  type: TrackingDocumentType,
  documentId: string,
): string {
  return `${TRACKING_DOCUMENTS_PATH}/${type}/${documentId}`;
}

/** `…/{type}/{id}/files`: list, complete, and each file under it. */
export function trackingDocumentFilesPath(
  type: TrackingDocumentType,
  documentId: string,
): string {
  return `${trackingDocumentPath(type, documentId)}/files`;
}

export function trackingDocumentFilePath(
  type: TrackingDocumentType,
  documentId: string,
  fileId: string,
): string {
  return `${trackingDocumentFilesPath(type, documentId)}/${fileId}`;
}

/** A file as the API returns it, from the files service. */
export function toTrackingFileResponse(
  file: TrackingDocumentFileView,
): ConstructionTrackingDocumentFileResponseModel {
  const url = trackingDocumentFilePath(
    file.documentType,
    file.documentId,
    file.id,
  );
  return {
    id: file.id,
    entryId: file.entryId,
    fileName: file.fileName,
    contentType: file.contentType,
    bytes: file.bytes,
    viewable: file.viewable,
    url,
    thumbUrl: file.thumbKey == null ? null : `${url}/thumbnail`,
    createdAt: file.createdAt.toISOString(),
    createdBy: file.createdBy,
    createdByName: file.createdByName,
    canRemove: file.canRemove,
  };
}

const VIEWABLE = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
]);

/**
 * An entry's file inside a feature's own response (a progress update, an
 * issue update, an observation), from `attachEntryFiles` / `entryFiles`:
 * `names` are uploaders by User id; `canRemove` is the feature's to say
 * (an entry's files usually go with the entry).
 */
export function toTrackingEntryFileResponse(
  file: TrackingDocumentFile,
  names: ReadonlyMap<string, string>,
  canRemove = false,
): ConstructionTrackingDocumentFileResponseModel {
  return toTrackingFileResponse({
    ...file,
    viewable: VIEWABLE.has(file.contentType),
    createdByName: names.get(file.createdBy) ?? null,
    canRemove,
  });
}

const TRACKING_SOURCES = new Set<string>(
  TRACKING_DOCUMENT_TYPES.map((type) => TRACKING_DOCUMENTS[type].gallerySource),
);

/**
 * The file and thumbnail routes of a Gallery row whose source is a tracking
 * document (CM-0019 §11): the row keeps the document id as `sourceId` and
 * the key, whose uuid is the file's id. Null for any other source.
 */
export function trackingGalleryRoutes(item: {
  source: string;
  sourceId: string;
  fileKey: string;
}): { file: string; thumbnail: string } | null {
  if (!TRACKING_SOURCES.has(item.source)) return null;
  const type = TRACKING_DOCUMENT_TYPES.find(
    (candidate) => TRACKING_DOCUMENTS[candidate].gallerySource === item.source,
  );
  const fileId = trackingFileIdOfKey(item.fileKey);
  if (type == null || fileId == null) return null;
  const file = trackingDocumentFilePath(type, item.sourceId, fileId);
  return { file, thumbnail: `${file}/thumbnail` };
}
