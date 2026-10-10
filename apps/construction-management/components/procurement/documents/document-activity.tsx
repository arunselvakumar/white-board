"use client";

import type { ProcurementDocumentType } from "@/src/procurement/domain/documents";

/**
 * The contract every procurement detail page renders (M5). The documents
 * ticket fills these in; pages only place them and pass these props.
 */

export type DocumentActivityProps = {
  documentType: ProcurementDocumentType;
  documentId: string;
  /** "Remarks" on PR / PO, "Comments" on MT / MR / DN. */
  heading?: "Remarks" | "Comments";
};

/** The remarks / comments thread of a document, newest last, with a box to add one. */
export function DocumentActivity(_props: DocumentActivityProps) {
  return null;
}

export type DocumentFilesProps = {
  documentType: ProcurementDocumentType;
  documentId: string;
  /** Whether the viewer may add and remove files (the page decides from access). */
  canEdit: boolean;
  /** Section heading; "Attachments" by default. */
  heading?: string;
};

/** The files attached to a document, with upload when `canEdit`. */
export function DocumentFiles(_props: DocumentFilesProps) {
  return null;
}
