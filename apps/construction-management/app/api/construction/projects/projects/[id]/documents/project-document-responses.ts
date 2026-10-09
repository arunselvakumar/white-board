import { z } from "zod";

import { contentDisposition } from "@/app/api/_lib/uploads";
import type { ProjectDocumentView } from "@/src/projects/application/project-documents";
import type { StoredObject } from "@/src/shared-kernel/files";

import type { ConstructionProjectsDocumentResponseModel } from "./project-document-models";

/** `/api/construction/projects/projects/{id}/documents`: every URL starts here. */
export function documentsPath(projectId: string): string {
  return `/api/construction/projects/projects/${projectId}/documents`;
}

export const ReceiveConstructionProjectsDocumentUploadQueryModel = z.object({
  key: z.string().min(1).describe("The `key` from starting the upload."),
});

export const GetConstructionProjectsDocumentQueryModel = z.object({
  download: z
    .enum(["1"])
    .optional()
    .describe("`1` saves the file instead of showing it."),
});

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
    createdAt: document.createdAt.toISOString(),
    createdBy: document.createdBy,
    createdByName: document.createdByName,
  };
}

/**
 * Streams a Project document with the type we sniffed when it was added,
 * never the one storage or the uploader claimed. A PDF or an image is
 * shown (`inline`) unless `download`; anything else always downloads.
 *
 * CSP: `default-src 'none'` stops any script or subresource in the file.
 * Checked in Chrome 154: its PDF viewer still renders an inline PDF under
 * it, opened directly and in an iframe on our page. `sandbox` is left off
 * shown files because it has broken Chrome's PDF viewer before (and still
 * blanks its thumbnails); `frame-ancestors 'self'` lets only our own pages
 * embed them. A download is never rendered, so it also gets `sandbox`.
 */
export function projectDocumentResponse(
  document: ProjectDocumentView,
  object: StoredObject,
  download: boolean,
): Response {
  const inline = document.viewable && !download;
  const headers = new Headers({
    "content-type": document.contentType,
    "content-disposition": contentDisposition(
      inline ? "inline" : "attachment",
      document.fileName,
    ),
    // Never reused from the browser cache: a deleted file, or another
    // Team Member signing in on a shared site tablet, must hit the access
    // checks again.
    "cache-control": "private, no-store",
    "x-content-type-options": "nosniff",
    "content-security-policy": inline
      ? "default-src 'none'; frame-ancestors 'self'"
      : "default-src 'none'; sandbox",
  });
  if (object.contentLength != null)
    headers.set("content-length", String(object.contentLength));
  return new Response(object.body, { headers });
}
