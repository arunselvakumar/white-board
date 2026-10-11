"use client";

import type { SiteWorkDocumentType } from "@/src/site-work/domain/site-work-documents";

import { SiteWorkDocumentFiles } from "./site-work-document-files";
import { SiteWorkDocumentRemarks } from "./site-work-document-remarks";

/**
 * What every site-work detail page renders under the document (CM-0016
 * §8): its photos or files and its remarks thread. Pages pass only these
 * props; each section loads its own data (`src/queries/site-work-documents.ts`),
 * shows a skeleton while it does, and "Try again" in place when it fails.
 */
export type SiteWorkDocumentActivityProps = {
  documentType: SiteWorkDocumentType;
  documentId: string;
  /**
   * Whether the viewer may add and remove files: Create or Update on the
   * document's menu (`canInSiteWork`). Remarks need only Read; the server
   * decides both again.
   */
  canEdit: boolean;
  /** "Work Photos", "Photos" or "Files" by type unless given. */
  filesHeading?: string;
  /**
   * False hides the files section (a worksheet whose Project settings hide
   * Work Photos and that has none). The remarks always show.
   */
  showFiles?: boolean;
};

/** The document's files and remarks: side by side on wide screens, stacked on phones. */
export function SiteWorkDocumentActivity({
  documentType,
  documentId,
  canEdit,
  filesHeading,
  showFiles = true,
}: SiteWorkDocumentActivityProps) {
  return (
    <div className="grid w-full min-w-0 gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
      <SiteWorkDocumentRemarks
        documentType={documentType}
        documentId={documentId}
      />
      {showFiles ? (
        <SiteWorkDocumentFiles
          documentType={documentType}
          documentId={documentId}
          canEdit={canEdit}
          {...(filesHeading == null ? {} : { heading: filesHeading })}
        />
      ) : null}
    </div>
  );
}
