import type {
  SiteWorkDocumentFileView,
  SiteWorkRemarkView,
} from "@/src/site-work/application/document-thread";
import { siteWorkFileIdOfKey } from "@/src/site-work/domain/document-thread";
import {
  isSiteWorkDocumentType,
  type SiteWorkDocumentType,
} from "@/src/site-work/domain/site-work-documents";

import {
  DOCUMENTS_PATH,
  type ConstructionSiteWorkDocumentFileResponseModel,
  type ConstructionSiteWorkRemarkResponseModel,
} from "./document-models";

/** `/api/construction/site-work/documents/{type}/{id}`. */
export function documentPath(
  type: SiteWorkDocumentType,
  documentId: string,
): string {
  return `${DOCUMENTS_PATH}/${type}/${documentId}`;
}

/** `…/{type}/{id}/files`: list, complete, and each file under it. */
export function documentFilesPath(
  type: SiteWorkDocumentType,
  documentId: string,
): string {
  return `${documentPath(type, documentId)}/files`;
}

export function documentFilePath(
  type: SiteWorkDocumentType,
  documentId: string,
  fileId: string,
): string {
  return `${documentFilesPath(type, documentId)}/${fileId}`;
}

export function toDocumentFileResponse(
  file: SiteWorkDocumentFileView,
): ConstructionSiteWorkDocumentFileResponseModel {
  const url = documentFilePath(file.documentType, file.documentId, file.id);
  return {
    id: file.id,
    remarkId: file.remarkId,
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

export function toRemarkResponse(
  remark: SiteWorkRemarkView,
): ConstructionSiteWorkRemarkResponseModel {
  return {
    id: remark.id,
    body: remark.body,
    createdAt: remark.createdAt.toISOString(),
    createdBy: remark.createdBy,
    createdByName: remark.createdByName,
    files: remark.files.map(toDocumentFileResponse),
  };
}

/**
 * The file and thumbnail routes of a Gallery row whose source is a
 * site-work document (CM-0016 §8): the row keeps the document id as
 * `sourceId` and the key, whose uuid is the file's id. Null for any other
 * source.
 */
export function siteWorkGalleryRoutes(item: {
  source: string;
  sourceId: string;
  fileKey: string;
}): { file: string; thumbnail: string } | null {
  if (!isSiteWorkDocumentType(item.source)) return null;
  const fileId = siteWorkFileIdOfKey(item.fileKey);
  if (fileId == null) return null;
  const file = documentFilePath(item.source, item.sourceId, fileId);
  return { file, thumbnail: `${file}/thumbnail` };
}
