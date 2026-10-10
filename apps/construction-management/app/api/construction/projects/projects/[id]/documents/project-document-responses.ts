import {
  FileDownloadQueryModel,
  UploadKeyQueryModel,
  storedFileResponse,
} from "@/app/api/_lib/attachments";
import type { ProjectDocumentView } from "@/src/projects/application/project-documents";
import type { StoredObject } from "@/src/shared-kernel/files";

import type { ConstructionProjectsDocumentResponseModel } from "./project-document-models";

/** `/api/construction/projects/projects/{id}/documents`: every URL starts here. */
export function documentsPath(projectId: string): string {
  return `/api/construction/projects/projects/${projectId}/documents`;
}

export const ReceiveConstructionProjectsDocumentUploadQueryModel =
  UploadKeyQueryModel;

export const GetConstructionProjectsDocumentQueryModel = FileDownloadQueryModel;

export function toProjectDocumentResponse(
  document: ProjectDocumentView,
): ConstructionProjectsDocumentResponseModel {
  return {
    id: document.id,
    kind: document.kind,
    fileName: document.fileName,
    contentType: document.contentType,
    bytes: document.bytes,
    viewable: document.viewable,
    url: `${documentsPath(document.projectId)}/${document.id}`,
    thumbUrl:
      document.thumbKey == null
        ? null
        : `${documentsPath(document.projectId)}/${document.id}/thumbnail`,
    createdAt: document.createdAt.toISOString(),
    createdBy: document.createdBy,
    createdByName: document.createdByName,
  };
}

/**
 * Streams a Project document with the type we sniffed when it was added
 * (`storedFileResponse`): a PDF or an image is shown unless `download`;
 * anything else always downloads.
 */
export function projectDocumentResponse(
  document: ProjectDocumentView,
  object: StoredObject,
  download: boolean,
): Response {
  return storedFileResponse(document, object, download);
}
