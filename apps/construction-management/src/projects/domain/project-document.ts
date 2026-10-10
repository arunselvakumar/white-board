import {
  isAttachmentKey,
  newAttachmentKey,
  storedExtension as kernelStoredExtension,
} from "@/src/shared-kernel/attachments/attachment-key";
import { uploadKeyInvalid as kernelUploadKeyInvalid } from "@/src/shared-kernel/attachments/attachment-uploads";
import { isProgramName } from "@/src/shared-kernel/attachments/program-names";
import { programNotAllowed as kernelProgramNotAllowed } from "@/src/shared-kernel/attachments/upload-policy";
import type { DomainError } from "@/src/shared-kernel/domain-error";

import type { ProjectDocumentKind } from "./project-document-rules";
import { PROJECT_DOCUMENT_POLICY } from "./project-upload-policies";

/** A file kept on a Project (CM-414), as stored. */
export type ProjectDocument = {
  id: string;
  workspaceId: string;
  projectId: string;
  kind: ProjectDocumentKind;
  /** Where the object is in storage. */
  fileKey: string;
  fileName: string;
  /** What we serve it as: a sniffed PDF or image, else octet-stream. */
  contentType: string;
  bytes: number;
  /** The browser-made WebP of an image (CM-407), if one was sent. */
  thumbKey?: string | null;
  createdAt: Date;
  createdBy: string;
};

const FOLDER = PROJECT_DOCUMENT_POLICY.purpose;

export function isBlockedDocumentName(fileName: string): boolean {
  return isProgramName(fileName);
}

export function programNotAllowed(): DomainError {
  return kernelProgramNotAllowed(PROJECT_DOCUMENT_POLICY);
}

/** The extension the stored object gets: the name's own when safe, else `bin`. */
export function storedExtension(fileName: string): string {
  return kernelStoredExtension(fileName);
}

/**
 * A new key for one of the Project's files:
 * `companies/<workspaceId>/project-documents/<projectId>/<uuid>.<ext>`.
 */
export function projectDocumentKey(
  workspaceId: string,
  projectId: string,
  fileName: string,
  now: Date = new Date(),
): string {
  return newAttachmentKey(workspaceId, FOLDER, projectId, fileName, now);
}

/**
 * Whether `key` is one `projectDocumentKey` could have made for this
 * Company and Project: the exact folder, then a uuid and a safe, allowed
 * extension, and nothing else (no `..`, no extra segments).
 */
export function isProjectDocumentKey(
  key: string,
  workspaceId: string,
  projectId: string,
): boolean {
  return isAttachmentKey(key, workspaceId, FOLDER, projectId);
}

export function uploadKeyInvalid(): DomainError {
  return kernelUploadKeyInvalid();
}
