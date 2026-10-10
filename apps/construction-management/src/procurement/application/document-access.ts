import {
  can,
  hasFlag,
  menuByKey,
  type Flag,
  type MemberAccess,
} from "@/src/shared-kernel/access";

import type { LocatedDocument } from "../domain/document-thread";
import { PROCUREMENT_DOCUMENTS } from "../domain/documents";

/**
 * Whether the member holds `flag` on the document's menu on any of its
 * sides: on its Project for a project-scoped menu (a Store side, and the
 * store-only documents, on the Company-level menu). A Material Transfer
 * may be seen from either side (ADR CM-0015 §4).
 */
export function canOnDocument(
  access: MemberAccess,
  document: Pick<LocatedDocument, "type" | "scopes">,
  flag: Flag,
): boolean {
  const { menu } = PROCUREMENT_DOCUMENTS[document.type];
  const scopes = document.scopes.length === 0 ? [null] : document.scopes;
  return scopes.some((projectId) =>
    can(access, menu, flag, projectId == null ? {} : { projectId }),
  );
}

/**
 * Whether View all hides this document from the member: its menu has the
 * View all flag (Material Received), the member lacks it on the
 * document's side, and someone else raised it. The document's own routes
 * answer 404 then, and so do its thread and files.
 */
export function hiddenWithoutViewAll(
  access: MemberAccess,
  document: Pick<LocatedDocument, "type" | "scopes" | "createdBy">,
): boolean {
  const { menu } = PROCUREMENT_DOCUMENTS[document.type];
  if (!hasFlag(menuByKey(menu)?.supported ?? 0, "view_all")) return false;
  if (document.createdBy === access.userId) return false;
  return !canOnDocument(access, document, "view_all");
}

/**
 * What the member may do with a document's thread and files:
 * - read the thread and files, and **comment**: Read (anyone who can see
 *   the document can comment, as in legacy);
 * - **upload**: Create or Update;
 * - **remove any file**: Update; with Create only, their own uploads.
 */
export type DocumentRights = {
  read: boolean;
  comment: boolean;
  upload: boolean;
  removeAny: boolean;
  removeOwn: boolean;
};

export function documentRights(
  access: MemberAccess,
  document: Pick<LocatedDocument, "type" | "scopes">,
): DocumentRights {
  const read = canOnDocument(access, document, "read");
  const create = canOnDocument(access, document, "create");
  const update = canOnDocument(access, document, "update");
  return {
    read,
    comment: read,
    upload: read && (create || update),
    removeAny: read && update,
    removeOwn: read && (create || update),
  };
}

/** Whether these rights remove this file. */
export function mayRemove(
  rights: DocumentRights,
  file: { createdBy: string },
  userId: string,
): boolean {
  return rights.removeAny || (rights.removeOwn && file.createdBy === userId);
}
