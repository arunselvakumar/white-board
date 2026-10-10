import { fileExtension } from "../files/file-name";
import { newId } from "../ids";
import { PROGRAM_EXTENSIONS } from "./program-names";

/** Lowercase letters and digits only, so a key never carries a surprise. */
const SAFE_EXTENSION = /^[a-z0-9]{1,10}$/;

/** What `newId` and `crypto.randomUUID` produce. */
const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";

const KEY_FILE = new RegExp(`^(${UUID})\\.([a-z0-9]{1,10})$`);

/** Workspace and owner ids, and purposes: letters, digits, `_` and `-`. */
const SAFE_SEGMENT = /^[A-Za-z0-9_-]+$/;

/** Where a browser-made thumbnail of the object at `key` is kept (ADR CM-0014). */
export function thumbnailKeyOf(key: string): string {
  return `${key}.thumb.webp`;
}

/** The extension the stored object gets: the name's own when safe, else `bin`. */
export function storedExtension(fileName: string): string {
  const extension = fileExtension(fileName);
  return extension != null && SAFE_EXTENSION.test(extension)
    ? extension
    : "bin";
}

/** `companies/<workspaceId>/<purpose>/<ownerId>/`, or null for unsafe ids. */
export function attachmentFolder(
  workspaceId: string,
  purpose: string,
  ownerId: string,
): string | null {
  if (
    !SAFE_SEGMENT.test(workspaceId) ||
    !SAFE_SEGMENT.test(purpose) ||
    !SAFE_SEGMENT.test(ownerId)
  )
    return null;
  return `companies/${workspaceId}/${purpose}/${ownerId}/`;
}

/**
 * A new key for one of the owner's files:
 * `companies/<workspaceId>/<purpose>/<ownerId>/<uuid>.<ext>`.
 */
export function newAttachmentKey(
  workspaceId: string,
  purpose: string,
  ownerId: string,
  fileName: string,
  now: Date = new Date(),
): string {
  const folder = attachmentFolder(workspaceId, purpose, ownerId);
  if (folder == null) throw new Error("Unsafe workspace, purpose or owner id");
  return `${folder}${newId(now.getTime())}.${storedExtension(fileName)}`;
}

/**
 * Whether `key` is one `newAttachmentKey` could have made for this
 * Company, purpose and owner: the exact folder, then a uuid and a safe
 * extension that is not a program's, and nothing else (no `..`, no extra
 * segments).
 */
export function isAttachmentKey(
  key: string,
  workspaceId: string,
  purpose: string,
  ownerId: string,
): boolean {
  const folder = attachmentFolder(workspaceId, purpose, ownerId);
  if (folder == null || !key.startsWith(folder)) return false;
  const match = KEY_FILE.exec(key.slice(folder.length));
  const extension = match?.[2];
  return (
    extension != null &&
    !(PROGRAM_EXTENSIONS as readonly string[]).includes(extension)
  );
}
