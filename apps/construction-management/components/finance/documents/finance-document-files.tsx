"use client";

import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { Paperclip, RotateCw, X } from "lucide-react";
import { useId, useRef, useState } from "react";
import { Button } from "@repo/ui/components/button";
import { Input } from "@repo/ui/components/input";
import { Progress } from "@repo/ui/components/progress";

import { DocumentSection } from "@/components/procurement/documents/document-section";
import { DocumentFileIcon } from "@/components/projects/documents/document-file-icon";
import { FileThumbnail } from "@/components/projects/files/file-thumbnail";
import { FileViewer } from "@/components/projects/files/file-viewer";
import { useDirectUpload } from "@/components/uploads/use-direct-upload";
import {
  FINANCE_DOCUMENT_FILES_MAX,
  FINANCE_FILE_INPUT_ACCEPT,
  checkFinanceFile,
  financeDocumentKey,
  financeFileHint,
  financeFilesQuery,
  uploadFinanceFile,
  type FinanceDocumentFile,
} from "@/src/queries/finance-documents";
import type { FinanceDocumentType } from "@/src/finance/domain/finance-documents";

import {
  RemoveFinanceFileDialog,
  financeFileLine,
  financeFilesHeading,
  financeOpenHref,
  financeViewable,
} from "./finance-file-parts";

export type FinanceDocumentFilesProps = {
  documentType: FinanceDocumentType;
  documentId: string;
  /** Whether the page lets the viewer add and remove files (from access). */
  canEdit: boolean;
  /** "Work Photos", "Photos" or "Files" by type unless given. */
  heading?: string;
};

/**
 * A finance document's own receipts, photos and invoice copies (ADR
 * CM-0017) as a grid of thumbnails; remarks' files stay under their
 * remarks. With `canEdit` (and Create or Update on the document, which the
 * server reports), files upload at once with progress, and × removes one
 * the viewer may remove. PDFs and images only; they never join the
 * Project Gallery.
 */
export function FinanceDocumentFiles(props: FinanceDocumentFilesProps) {
  const headingId = useId();
  return (
    <DocumentSection
      heading={props.heading ?? financeFilesHeading(props.documentType)}
      headingId={headingId}
    >
      <FilesBody {...props} />
    </DocumentSection>
  );
}

function FilesBody({
  documentType,
  documentId,
  canEdit,
  heading = financeFilesHeading(documentType),
}: FinanceDocumentFilesProps) {
  const queryClient = useQueryClient();
  const input = useRef<HTMLInputElement>(null);
  const { data } = useSuspenseQuery(
    financeFilesQuery(documentType, documentId),
  );
  const [opened, setOpened] = useState<FinanceDocumentFile | null>(null);
  const [removing, setRemoving] = useState<FinanceDocumentFile | null>(null);
  const { uploads, add, retry, dismiss, canRetry } = useDirectUpload<
    object,
    FinanceDocumentFile
  >({
    upload: (file, _meta, options) =>
      uploadFinanceFile(documentType, documentId, file, options),
    check: (file) => checkFinanceFile(file),
    onUploaded: (_file, item) => {
      void queryClient
        .invalidateQueries({
          queryKey: financeDocumentKey(documentType, documentId),
        })
        .then(() => {
          dismiss(item.id);
        });
    },
  });

  const files = data.items.filter((file) => file.remarkId == null);
  const mayUpload = canEdit && data.canUpload;
  const pending = uploads.filter((upload) => upload.state !== "done");
  const room = Math.max(
    0,
    FINANCE_DOCUMENT_FILES_MAX - data.items.length - pending.length,
  );

  return (
    <div className="space-y-3">
      {files.length === 0 && pending.length === 0 ? (
        <p className="bg-card text-muted-foreground rounded-lg border border-dashed p-6 text-center text-sm">
          {mayUpload
            ? "No files yet. Add a receipt, a PDF or photos."
            : "No files."}
        </p>
      ) : (
        <ul
          aria-label={heading}
          className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4"
        >
          {files.map((file) => (
            <li key={file.id} className="relative min-w-0">
              <a
                href={financeOpenHref(file)}
                target={file.viewable ? undefined : "_blank"}
                rel="noreferrer"
                aria-label={`Open ${file.fileName}`}
                className="group focus-visible:ring-ring/50 block min-w-0 rounded-lg focus-visible:ring-3 focus-visible:outline-none"
                onClick={(event) => {
                  if (!file.viewable) return;
                  event.preventDefault();
                  setOpened(file);
                }}
              >
                <FileThumbnail
                  file={financeViewable(file)}
                  className="w-full border group-hover:opacity-90"
                />
                <span className="mt-1.5 block truncate text-sm font-medium">
                  {file.fileName}
                </span>
                <span className="text-muted-foreground block truncate text-xs">
                  {financeFileLine(file)}
                </span>
              </a>
              {canEdit && file.canRemove ? (
                <Button
                  type="button"
                  variant="secondary"
                  size="icon-xs"
                  aria-label={`Remove ${file.fileName}`}
                  className="absolute top-1.5 right-1.5 shadow-sm"
                  onClick={() => {
                    setRemoving(file);
                  }}
                >
                  <X />
                </Button>
              ) : null}
            </li>
          ))}
          {pending.map((upload) => (
            <li
              key={upload.id}
              className="min-w-0"
              aria-label={`Uploading ${upload.file.name}`}
            >
              <span className="bg-muted text-muted-foreground flex aspect-square items-center justify-center rounded-md border">
                <DocumentFileIcon
                  fileName={upload.file.name}
                  contentType={upload.file.type}
                  className="size-1/3 max-h-10 max-w-10"
                />
              </span>
              <span className="mt-1.5 block truncate text-sm font-medium">
                {upload.file.name}
              </span>
              {upload.state === "error" ? (
                <span className="text-destructive block text-xs">
                  {upload.error}
                </span>
              ) : (
                <Progress
                  value={upload.progress}
                  aria-label={`${upload.file.name} upload`}
                  className="mt-1"
                />
              )}
              <span className="mt-1 flex gap-1">
                {canRetry(upload) ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    aria-label={`Retry ${upload.file.name}`}
                    onClick={() => {
                      retry(upload.id);
                    }}
                  >
                    <RotateCw />
                  </Button>
                ) : null}
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  aria-label={
                    upload.state === "error"
                      ? `Dismiss ${upload.file.name}`
                      : `Cancel upload of ${upload.file.name}`
                  }
                  onClick={() => {
                    dismiss(upload.id);
                  }}
                >
                  <X />
                </Button>
              </span>
            </li>
          ))}
        </ul>
      )}
      {mayUpload ? (
        <div className="relative">
          <Input
            ref={input}
            type="file"
            multiple
            accept={FINANCE_FILE_INPUT_ACCEPT}
            aria-label={`Choose files for ${heading}`}
            className="sr-only top-0 left-0"
            tabIndex={-1}
            onChange={(event) => {
              const picked = Array.from(event.target.files ?? []).slice(
                0,
                room,
              );
              event.target.value = "";
              if (picked.length > 0) add(picked, {});
            }}
          />
          <Button
            type="button"
            variant="outline"
            disabled={room === 0}
            onClick={() => input.current?.click()}
          >
            <Paperclip aria-hidden="true" />
            Add files
          </Button>
          <p className="text-muted-foreground mt-1.5 text-xs">
            {room === 0
              ? `This document has ${String(FINANCE_DOCUMENT_FILES_MAX)} files, the most it can keep. Remove one to add another.`
              : financeFileHint()}
          </p>
        </div>
      ) : null}
      <FileViewer
        file={opened == null ? null : financeViewable(opened)}
        description={opened == null ? undefined : financeFileLine(opened)}
        onClose={() => {
          setOpened(null);
        }}
      />
      <RemoveFinanceFileDialog
        documentType={documentType}
        documentId={documentId}
        file={removing}
        onClose={() => {
          setRemoving(null);
        }}
      />
    </div>
  );
}
