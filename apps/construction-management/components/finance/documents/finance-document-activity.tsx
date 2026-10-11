"use client";

import type { FinanceDocumentType } from "@/src/finance/domain/finance-documents";

import { FinanceDocumentFiles } from "./finance-document-files";
import { FinanceDocumentRemarks } from "./finance-document-remarks";

/**
 * What every finance detail page renders under the document (ADR
 * CM-0017): its receipts and files, and its remarks thread. Pages pass
 * only these props; each section loads its own data
 * (`src/queries/finance-documents.ts`), shows a skeleton while it does, and
 * "Try again" in place when it fails.
 */
export type FinanceDocumentActivityProps = {
  documentType: FinanceDocumentType;
  documentId: string;
  /**
   * Whether the viewer may add and remove files: Create or Update on the
   * document's menu (`canInFinance`). Remarks need only Read; the server
   * decides both again.
   */
  canEdit: boolean;
  /** "Photos & receipts" on a voucher, "Files" elsewhere, unless given. */
  filesHeading?: string;
  /** False hides the files section. The remarks always show. */
  showFiles?: boolean;
};

/** The document's files and remarks: side by side on wide screens, stacked on phones. */
export function FinanceDocumentActivity({
  documentType,
  documentId,
  canEdit,
  filesHeading,
  showFiles = true,
}: FinanceDocumentActivityProps) {
  return (
    <div className="grid w-full min-w-0 gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
      <FinanceDocumentRemarks
        documentType={documentType}
        documentId={documentId}
      />
      {showFiles ? (
        <FinanceDocumentFiles
          documentType={documentType}
          documentId={documentId}
          canEdit={canEdit}
          {...(filesHeading == null ? {} : { heading: filesHeading })}
        />
      ) : null}
    </div>
  );
}
