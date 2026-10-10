import type { UploadPolicy } from "@/src/shared-kernel/attachments/upload-policy";
import { MULTIPART_FROM_BYTES } from "@/src/shared-kernel/attachments/upload-policy";

import { PROJECT_DOCUMENT_MAX_BYTES } from "./project-document-rules";

const MB = 1024 * 1024;

/**
 * Project Documents (CM-414): any file but programs, at most 25 MB. Keys
 * stay `companies/<workspaceId>/project-documents/<projectId>/…`.
 */
export const PROJECT_DOCUMENT_POLICY: UploadPolicy = {
  purpose: "project-documents",
  accept: "any_but_programs",
  maxBytes: PROJECT_DOCUMENT_MAX_BYTES,
  multipartFromBytes: MULTIPART_FROM_BYTES,
  programMessage:
    "Programs cannot be kept on a Project. Choose a document, a picture, a drawing or a zip.",
};

/** A drawing revision (CM-408): a PDF, an image, a DWG or a DXF, at most 100 MB. */
export const DRAWING_MAX_BYTES = 100 * MB;

export const DRAWING_POLICY: UploadPolicy = {
  purpose: "drawings",
  accept: "drawing",
  maxBytes: DRAWING_MAX_BYTES,
  multipartFromBytes: MULTIPART_FROM_BYTES,
};

/** A testing report's file (CM-409): one PDF or image, at most 25 MB. */
export const TESTING_REPORT_MAX_BYTES = 25 * MB;

export const TESTING_REPORT_POLICY: UploadPolicy = {
  purpose: "testing-reports",
  accept: "pdf_or_image",
  maxBytes: TESTING_REPORT_MAX_BYTES,
  multipartFromBytes: MULTIPART_FROM_BYTES,
};
