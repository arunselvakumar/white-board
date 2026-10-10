import type {
  DocumentFileView,
  DocumentRemarkView,
} from "@/src/procurement/application/document-thread";
import { documentFileIdOfKey } from "@/src/procurement/domain/document-thread";
import {
  isProcurementDocumentType,
  type ProcurementDocumentType,
} from "@/src/procurement/domain/documents";

import {
  DOCUMENTS_PATH,
  type ConstructionProcurementDocumentFileResponseModel,
  type ConstructionProcurementRemarkResponseModel,
} from "./document-models";

/** `/api/construction/procurement/documents/{type}/{id}`. */
export function documentPath(
  type: ProcurementDocumentType,
  documentId: string,
): string {
  return `${DOCUMENTS_PATH}/${type}/${documentId}`;
}

/** `…/{type}/{id}/files`: list, complete, and each file under it. */
export function documentFilesPath(
  type: ProcurementDocumentType,
  documentId: string,
): string {
  return `${documentPath(type, documentId)}/files`;
}

export function documentFilePath(
  type: ProcurementDocumentType,
  documentId: string,
  fileId: string,
): string {
  return `${documentFilesPath(type, documentId)}/${fileId}`;
}

export function toDocumentFileResponse(
  file: DocumentFileView,
): ConstructionProcurementDocumentFileResponseModel {
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
  remark: DocumentRemarkView,
): ConstructionProcurementRemarkResponseModel {
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
 * procurement document (ADR CM-0014): the row keeps the document id as
 * `sourceId` and the key, whose uuid is the file's id. Null for any other
 * source.
 */
export function procurementGalleryRoutes(item: {
  source: string;
  sourceId: string;
  fileKey: string;
}): { file: string; thumbnail: string } | null {
  if (!isProcurementDocumentType(item.source)) return null;
  const fileId = documentFileIdOfKey(item.fileKey);
  if (fileId == null) return null;
  const file = documentFilePath(item.source, item.sourceId, fileId);
  return { file, thumbnail: `${file}/thumbnail` };
}
