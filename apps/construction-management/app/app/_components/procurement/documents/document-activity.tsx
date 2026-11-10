"use client";

import type { ProcurementDocumentType } from "@/src/procurement/domain/documents";

import { DocumentFilesView } from "./document-files-view";
import { DocumentThreadView } from "./document-thread-view";

/**
 * The contract every procurement detail page renders (M5). Pages only
 * place these and pass these props; each section loads its own data
 * (`src/queries/procurement-documents.ts`), shows a skeleton while it
 * does, and a "Try again" in place when it fails.
 */

export type DocumentActivityProps = {
  documentType: ProcurementDocumentType;
  documentId: string;
  /** "Remarks" on PR / PO, "Comments" on MT / MR / DN. */
  heading?: "Remarks" | "Comments";
};

/** Documents whose thread is called Remarks; the rest have Comments. */
const REMARKS_ON: readonly ProcurementDocumentType[] = [
  "purchase_request",
  "purchase_order",
  "goods_receipt",
];

/** The remarks / comments thread of a document, newest last, with a box to add one. */
export function DocumentActivity({
  documentType,
  documentId,
  heading,
}: DocumentActivityProps) {
  return (
    <DocumentThreadView
      documentType={documentType}
      documentId={documentId}
      heading={
        heading ?? (REMARKS_ON.includes(documentType) ? "Remarks" : "Comments")
      }
    />
  );
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
export function DocumentFiles({
  documentType,
  documentId,
  canEdit,
  heading = "Attachments",
}: DocumentFilesProps) {
  return (
    <DocumentFilesView
      documentType={documentType}
      documentId={documentId}
      canEdit={canEdit}
      heading={heading}
    />
  );
}
