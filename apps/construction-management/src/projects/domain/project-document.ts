import { DomainError } from "@/src/shared-kernel/domain-error";
import { fileExtension } from "@/src/shared-kernel/files";
import { newId } from "@/src/shared-kernel/ids";

import {
  BLOCKED_DOCUMENT_EXTENSIONS,
  type ProjectDocumentKind,
} from "./project-document-rules";

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
  createdAt: Date;
  createdBy: string;
};

const FOLDER = "project-documents";

/** Lowercase letters and digits only, so a key never carries a surprise. */
const SAFE_EXTENSION = /^[a-z0-9]{1,10}$/;

/** What `newId` and `crypto.randomUUID` produce. */
const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";

const KEY_FILE = new RegExp(`^(${UUID})\\.([a-z0-9]{1,10})$`);

/** Workspace ids are Better Auth ids: letters, digits, `_` and `-`. */
const SAFE_SEGMENT = /^[A-Za-z0-9_-]+$/;

export function isBlockedDocumentName(fileName: string): boolean {
  const extension = fileExtension(fileName);
  return (
    extension != null &&
    (BLOCKED_DOCUMENT_EXTENSIONS as readonly string[]).includes(extension)
  );
}

export function programNotAllowed(): DomainError {
  return new DomainError(
    "FILE_TYPE_NOT_ALLOWED",
    "Programs cannot be kept on a Project. Choose a document, a picture, a drawing or a zip.",
    { details: { blocked: BLOCKED_DOCUMENT_EXTENSIONS } },
  );
}

/** The extension the stored object gets: the name's own when safe, else `bin`. */
export function storedExtension(fileName: string): string {
  const extension = fileExtension(fileName);
  return extension != null && SAFE_EXTENSION.test(extension)
    ? extension
    : "bin";
}

function folderOf(workspaceId: string, projectId: string): string | null {
  if (!SAFE_SEGMENT.test(workspaceId) || !SAFE_SEGMENT.test(projectId))
    return null;
  return `companies/${workspaceId}/${FOLDER}/${projectId}/`;
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
  const folder = folderOf(workspaceId, projectId);
  if (folder == null) throw new Error("Unsafe workspace or Project id");
  return `${folder}${newId(now.getTime())}.${storedExtension(fileName)}`;
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
  const folder = folderOf(workspaceId, projectId);
  if (folder == null || !key.startsWith(folder)) return false;
  const match = KEY_FILE.exec(key.slice(folder.length));
  const extension = match?.[2];
  return (
    extension != null &&
    !(BLOCKED_DOCUMENT_EXTENSIONS as readonly string[]).includes(extension)
  );
}

export function uploadKeyInvalid(): DomainError {
  return new DomainError(
    "UPLOAD_KEY_INVALID",
    "This upload does not belong to this Project. Start the upload again.",
  );
}
