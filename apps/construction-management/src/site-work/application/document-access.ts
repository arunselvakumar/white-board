import { can, type Flag, type MemberAccess } from "@/src/shared-kernel/access";

import type { LocatedSiteWorkDocument } from "../domain/document-thread";
import { SITE_WORK_DOCUMENTS } from "../domain/site-work-documents";

/** Whether the member holds `flag` on the document's menu on its Project. */
export function canOnSiteWorkDocument(
  access: MemberAccess,
  document: Pick<LocatedSiteWorkDocument, "type" | "projectId">,
  flag: Flag,
): boolean {
  const { menu } = SITE_WORK_DOCUMENTS[document.type];
  return can(access, menu, flag, { projectId: document.projectId });
}

/**
 * What the member may do with a document's thread and files (CM-0016 §8,
 * as procurement's CM-0015 §13):
 * - read the thread and files, and **comment**: Read on its menu;
 * - **upload**: Create or Update;
 * - **remove any file**: Update; with Create only, their own uploads.
 */
export type SiteWorkDocumentRights = {
  read: boolean;
  comment: boolean;
  upload: boolean;
  removeAny: boolean;
  removeOwn: boolean;
};

export function siteWorkDocumentRights(
  access: MemberAccess,
  document: Pick<LocatedSiteWorkDocument, "type" | "projectId">,
): SiteWorkDocumentRights {
  const read = canOnSiteWorkDocument(access, document, "read");
  const create = canOnSiteWorkDocument(access, document, "create");
  const update = canOnSiteWorkDocument(access, document, "update");
  return {
    read,
    comment: read,
    upload: read && (create || update),
    removeAny: read && update,
    removeOwn: read && (create || update),
  };
}

/** Whether these rights remove this file. */
export function mayRemoveSiteWorkFile(
  rights: SiteWorkDocumentRights,
  file: { createdBy: string },
  userId: string,
): boolean {
  return rights.removeAny || (rights.removeOwn && file.createdBy === userId);
}
