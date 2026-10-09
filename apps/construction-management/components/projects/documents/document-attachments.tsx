"use client";

import type { ProjectDocumentKind } from "@/src/projects/domain/project-document-rules";

/**
 * Interface stub shared by the Project form and the Documents tab
 * (CM-414); the documents UI replaces the bodies, not the signatures.
 */

/** A file picked on Add Project, uploaded once the Project is saved. */
export type HeldFile = { id: string; file: File; kind: ProjectDocumentKind };

export type DocumentAttachmentsProps = {
  /** Null on Add Project: files are held until the Project exists. */
  projectId: string | null;
  kind: ProjectDocumentKind;
  /** The paper's name for screen readers, e.g. "Quotation". */
  label: string;
  held: readonly HeldFile[];
  onHeldChange: (next: HeldFile[]) => void;
  disabled?: boolean;
};

/**
 * A paperclip button plus the paper's files as chips under its row. With a
 * Project, a picked file uploads at once with progress and a chip's remove
 * deletes it (after confirming); without one, it joins `held`.
 */
export function DocumentAttachments(_props: DocumentAttachmentsProps) {
  return null;
}

export type HeldUploadStatus = { done: number; total: number } | null;

/** Uploads the held files after Add Project; reports which failed. */
export function useUploadHeldFiles(): {
  upload: (
    projectId: string,
    held: readonly HeldFile[],
  ) => Promise<{ failed: HeldFile[] }>;
  status: HeldUploadStatus;
} {
  return {
    upload: () => Promise.resolve({ failed: [] }),
    status: null,
  };
}
