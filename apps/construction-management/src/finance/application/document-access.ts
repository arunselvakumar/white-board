import { can, type Flag, type MemberAccess } from "@/src/shared-kernel/access";

import {
  FINANCE_DOCUMENTS,
  type LocatedFinanceDocument,
} from "../domain/finance-documents";

type Scoped = Pick<LocatedFinanceDocument, "type" | "projectId" | "storeId">;

/**
 * Whether the member holds `flag` on the document's menu (CM-0017 §14): on
 * its Project when it names one. A Store-located invoice or payment (no
 * Project to scope the menu) is the Owner's alone in M7.
 */
export function canOnFinanceDocument(
  access: MemberAccess,
  document: Scoped,
  flag: Flag,
): boolean {
  if (document.projectId == null && document.storeId != null)
    return access.role === "owner";
  const { menu } = FINANCE_DOCUMENTS[document.type];
  return can(
    access,
    menu,
    flag,
    document.projectId == null ? {} : { projectId: document.projectId },
  );
}

/**
 * Whether the document is hidden from the member (CM-0017 §9): a
 * petty-cash voucher on someone else's account, without Petty Cash View
 * all. Its routes answer 404 then, and so do its thread and files.
 */
export function hiddenFinanceDocument(
  access: MemberAccess,
  document: Pick<LocatedFinanceDocument, "type" | "holderUserId">,
): boolean {
  if (document.type !== "petty_cash_voucher") return false;
  if (document.holderUserId === access.userId) return false;
  return !can(access, "finance.petty_cash", "view_all");
}

/**
 * What the member may do with a document's thread and files (as in site
 * work and procurement):
 * - read the thread and files, and **comment**: Read on its menu;
 * - **upload**: Create or Update;
 * - **remove any file**: Update; with Create only, their own uploads.
 */
export type FinanceDocumentRights = {
  read: boolean;
  comment: boolean;
  upload: boolean;
  removeAny: boolean;
  removeOwn: boolean;
};

export function financeDocumentRights(
  access: MemberAccess,
  document: Scoped,
): FinanceDocumentRights {
  const read = canOnFinanceDocument(access, document, "read");
  const create = canOnFinanceDocument(access, document, "create");
  const update = canOnFinanceDocument(access, document, "update");
  return {
    read,
    comment: read,
    upload: read && (create || update),
    removeAny: read && update,
    removeOwn: read && (create || update),
  };
}

/** Whether these rights remove this file. */
export function mayRemoveFinanceFile(
  rights: FinanceDocumentRights,
  file: { createdBy: string },
  userId: string,
): boolean {
  return rights.removeAny || (rights.removeOwn && file.createdBy === userId);
}
