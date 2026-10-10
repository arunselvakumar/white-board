"use client";

import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { Paperclip, RotateCw, X } from "lucide-react";
import { useId, useRef, useState } from "react";
import { Button } from "@repo/ui/components/button";
import { Input } from "@repo/ui/components/input";
import { Progress } from "@repo/ui/components/progress";

import { useDirectUpload } from "@/components/uploads/use-direct-upload";
import { DocumentFileIcon } from "@/components/projects/documents/document-file-icon";
import { FileThumbnail } from "@/components/projects/files/file-thumbnail";
import { FileViewer } from "@/components/projects/files/file-viewer";
import { formatBytes } from "@/lib/project-documents";
import type { ProcurementDocumentType } from "@/src/procurement/domain/documents";
import {
  checkDocumentUpload,
  documentFilesQuery,
  procurementDocumentKey,
  uploadDocumentFile,
  type DocumentFile,
} from "@/src/queries/procurement-documents";

import { openHref, RemoveFileDialog, viewable } from "./document-file-parts";
import { DocumentSection } from "./document-section";

type Props = {
  documentType: ProcurementDocumentType;
  documentId: string;
  canEdit: boolean;
  heading: string;
};

/**
 * A document's own attachments (PR "Required Materials List", PO / GRN /
 * MT / MR / DN attachments) as a grid of thumbnails. Comments' photos stay
 * under their comments. With `canEdit` (and Create or Update on the
 * document, which the server reports), files upload at once with progress
 * and × removes a file the viewer may remove.
 */
export function DocumentFilesView(props: Props) {
  const headingId = useId();
  return (
    <DocumentSection heading={props.heading} headingId={headingId}>
      <FilesBody {...props} />
    </DocumentSection>
  );
}

function FilesBody({ documentType, documentId, canEdit, heading }: Props) {
  const queryClient = useQueryClient();
  const input = useRef<HTMLInputElement>(null);
  const { data } = useSuspenseQuery(
    documentFilesQuery(documentType, documentId),
  );
  const [opened, setOpened] = useState<DocumentFile | null>(null);
  const [removing, setRemoving] = useState<DocumentFile | null>(null);
  const { uploads, add, retry, dismiss, canRetry } = useDirectUpload<
    object,
    DocumentFile
  >({
    upload: (file, _meta, options) =>
      uploadDocumentFile(documentType, documentId, file, options),
    check: checkDocumentUpload,
    onUploaded: (_file, item) => {
      void queryClient
        .invalidateQueries({
          queryKey: procurementDocumentKey(documentType, documentId),
        })
        .then(() => {
          dismiss(item.id);
        });
    },
  });

  const files = data.items.filter((file) => file.remarkId == null);
  const mayUpload = canEdit && data.canUpload;
  const pending = uploads.filter((upload) => upload.state !== "done");

  return (
    <div className="space-y-3">
      {files.length === 0 && pending.length === 0 ? (
        <p className="text-muted-foreground rounded-lg border border-dashed p-6 text-center text-sm">
          {mayUpload
            ? "No attachments yet. Attach a quotation, an invoice, a challan or photos."
            : "No attachments."}
        </p>
      ) : (
        <ul
          aria-label={`${heading} files`}
          className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4"
        >
          {files.map((file) => (
            <li key={file.id} className="relative min-w-0">
              <a
                href={openHref(file)}
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
                  file={viewable(file)}
                  className="w-full border group-hover:opacity-90"
                />
                <span className="mt-1.5 block truncate text-sm font-medium">
                  {file.fileName}
                </span>
                <span className="text-muted-foreground block truncate text-xs">
                  {formatBytes(file.bytes)}
                  {file.createdByName == null
                    ? null
                    : ` · ${file.createdByName}`}
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
        <div>
          <Input
            ref={input}
            type="file"
            multiple
            aria-label={`Choose files for ${heading}`}
            className="sr-only"
            tabIndex={-1}
            onChange={(event) => {
              const picked = Array.from(event.target.files ?? []);
              event.target.value = "";
              if (picked.length > 0) add(picked, {});
            }}
          />
          <Button
            type="button"
            variant="outline"
            onClick={() => input.current?.click()}
          >
            <Paperclip aria-hidden="true" />
            Attach files
          </Button>
          <p className="text-muted-foreground mt-1.5 text-xs">
            PDF, photos, Excel, Word or CSV, up to 25 MB each.
          </p>
        </div>
      ) : null}
      <FileViewer
        file={opened == null ? null : viewable(opened)}
        description={
          opened == null
            ? undefined
            : `${formatBytes(opened.bytes)}${opened.createdByName == null ? "" : ` · ${opened.createdByName}`}`
        }
        onClose={() => {
          setOpened(null);
        }}
      />
      <RemoveFileDialog
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
