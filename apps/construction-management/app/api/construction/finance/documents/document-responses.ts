import type {
  FinanceDocumentFileView,
  FinanceRemarkView,
} from "@/src/finance/application/document-thread";
import type { FinanceDocumentType } from "@/src/finance/domain/finance-documents";

import {
  DOCUMENTS_PATH,
  type ConstructionFinanceDocumentFileResponseModel,
  type ConstructionFinanceRemarkResponseModel,
} from "./document-models";

/** `/api/construction/finance/documents/{type}/{id}`. */
export function documentPath(
  type: FinanceDocumentType,
  documentId: string,
): string {
  return `${DOCUMENTS_PATH}/${type}/${documentId}`;
}

/** `…/{type}/{id}/files`: list, complete, and each file under it. */
export function documentFilesPath(
  type: FinanceDocumentType,
  documentId: string,
): string {
  return `${documentPath(type, documentId)}/files`;
}

export function documentFilePath(
  type: FinanceDocumentType,
  documentId: string,
  fileId: string,
): string {
  return `${documentFilesPath(type, documentId)}/${fileId}`;
}

export function toDocumentFileResponse(
  file: FinanceDocumentFileView,
): ConstructionFinanceDocumentFileResponseModel {
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
  remark: FinanceRemarkView,
): ConstructionFinanceRemarkResponseModel {
  return {
    id: remark.id,
    body: remark.body,
    createdAt: remark.createdAt.toISOString(),
    createdBy: remark.createdBy,
    createdByName: remark.createdByName,
    files: remark.files.map(toDocumentFileResponse),
  };
}
