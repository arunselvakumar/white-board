"use client";

import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { ImagePlus, Paperclip, RotateCw, X } from "lucide-react";
import { useId, useRef, useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@repo/ui/components/alert-dialog";
import { Button } from "@repo/ui/components/button";
import { Input } from "@repo/ui/components/input";
import { Progress } from "@repo/ui/components/progress";

import { FormAlert } from "@/components/auth/form-alert";
import { DocumentSection } from "@/components/procurement/documents/document-section";
import { DocumentFileIcon } from "@/components/projects/documents/document-file-icon";
import { FileThumbnail } from "@/components/projects/files/file-thumbnail";
import {
  downloadUrl,
  FileViewer,
} from "@/components/projects/files/file-viewer";
import { useDirectUpload } from "@/components/uploads/use-direct-upload";
import { formatBytes } from "@/lib/project-documents";
import { uploadErrorMessage } from "@/src/queries/direct-upload";
import {
  SALES_FILE_ROLE_RULES,
  checkSalesFile,
  salesDocumentKey,
  salesFileHint,
  salesFileInputAccept,
  salesFilesQuery,
  uploadSalesFile,
  useRemoveSalesFile,
  type SalesDocumentFile,
} from "@/src/queries/sales-documents";
import type {
  SalesDocumentType,
  SalesFileRole,
} from "@/src/sales/domain/document-files";

export type SalesDocumentFilesProps = {
  documentType: SalesDocumentType;
  documentId: string;
  /** The roles shown, each as its own group (e.g. Visiting Card, Photos). */
  roles: readonly { role: SalesFileRole; label: string }[];
  /** Whether the page lets the viewer add and remove files (from access). */
  canEdit: boolean;
  heading?: string;
};

function viewable(file: SalesDocumentFile) {
  return {
    name: file.fileName,
    url: file.url,
    contentType: file.contentType,
    thumbUrl: file.thumbUrl,
  };
}

function line(file: SalesDocumentFile): string {
  return `${formatBytes(file.bytes)}${file.createdByName == null ? "" : ` · ${file.createdByName}`}`;
}

/**
 * An inquiry's or booking's own files by role (CM-1003): a section with a
 * group per role (a Visiting Card, photos, a Booking Form). With `canEdit`
 * and the upload right the server reports, files upload at once with
 * progress, and × removes one the viewer may remove. These files are
 * personal data and never appear in the Project Gallery. On a **new**
 * form use `SalesPendingFilesField`.
 */
export function SalesDocumentFiles(props: SalesDocumentFilesProps) {
  const headingId = useId();
  return (
    <DocumentSection heading={props.heading ?? "Files"} headingId={headingId}>
      <FilesBody {...props} />
    </DocumentSection>
  );
}

function FilesBody({
  documentType,
  documentId,
  roles,
  canEdit,
}: SalesDocumentFilesProps) {
  const { data } = useSuspenseQuery(salesFilesQuery(documentType, documentId));
  const [opened, setOpened] = useState<SalesDocumentFile | null>(null);
  const [removing, setRemoving] = useState<SalesDocumentFile | null>(null);
  return (
    <div className="space-y-5">
      {roles.map(({ role, label }) => (
        <RoleGroup
          key={role}
          documentType={documentType}
          documentId={documentId}
          role={role}
          label={label}
          files={data.items.filter((file) => file.role === role)}
          mayUpload={canEdit && data.canUpload}
          canEdit={canEdit}
          onOpen={setOpened}
          onRemove={setRemoving}
        />
      ))}
      <FileViewer
        file={opened == null ? null : viewable(opened)}
        description={opened == null ? undefined : line(opened)}
        onClose={() => {
          setOpened(null);
        }}
      />
      <RemoveSalesFileDialog
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

function RoleGroup({
  documentType,
  documentId,
  role,
  label,
  files,
  mayUpload,
  canEdit,
  onOpen,
  onRemove,
}: {
  documentType: SalesDocumentType;
  documentId: string;
  role: SalesFileRole;
  label: string;
  files: SalesDocumentFile[];
  mayUpload: boolean;
  canEdit: boolean;
  onOpen: (file: SalesDocumentFile) => void;
  onRemove: (file: SalesDocumentFile) => void;
}) {
  const queryClient = useQueryClient();
  const input = useRef<HTMLInputElement>(null);
  const rule = SALES_FILE_ROLE_RULES[role];
  const { uploads, add, retry, dismiss, canRetry } = useDirectUpload<
    object,
    SalesDocumentFile
  >({
    upload: (file, _meta, options) =>
      uploadSalesFile(documentType, documentId, role, file, options),
    check: (file) => checkSalesFile(role, file),
    onUploaded: (_file, item) => {
      void queryClient
        .invalidateQueries({
          queryKey: salesDocumentKey(documentType, documentId),
        })
        .then(() => {
          dismiss(item.id);
        });
    },
  });
  const pending = uploads.filter((upload) => upload.state !== "done");
  const room = Math.max(0, rule.max - files.length - pending.length);
  const photos = rule.accept === "images";
  const groupId = useId();

  return (
    <div role="group" aria-labelledby={groupId} className="min-w-0 space-y-2">
      <h3 id={groupId} className="text-sm font-medium">
        {label}
      </h3>
      {files.length === 0 && pending.length === 0 ? (
        <p className="bg-card text-muted-foreground rounded-lg border border-dashed p-4 text-center text-sm">
          {`No ${label.toLowerCase()} yet.`}
        </p>
      ) : (
        <ul
          aria-label={label}
          className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4"
        >
          {files.map((file) => (
            <li key={file.id} className="relative min-w-0">
              <a
                href={file.viewable ? file.url : downloadUrl(file)}
                target={file.viewable ? undefined : "_blank"}
                rel="noreferrer"
                aria-label={`Open ${file.fileName}`}
                className="group focus-visible:ring-ring/50 block min-w-0 rounded-lg focus-visible:ring-3 focus-visible:outline-none"
                onClick={(event) => {
                  if (!file.viewable) return;
                  event.preventDefault();
                  onOpen(file);
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
                  {line(file)}
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
                    onRemove(file);
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
                  aria-label={`Dismiss ${upload.file.name}`}
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
      {mayUpload && room > 0 ? (
        <div className="relative">
          <Input
            ref={input}
            type="file"
            multiple={rule.max > 1}
            accept={salesFileInputAccept(role)}
            aria-label={`Choose files for ${label}`}
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
            size="sm"
            onClick={() => input.current?.click()}
          >
            {photos ? (
              <ImagePlus aria-hidden="true" />
            ) : (
              <Paperclip aria-hidden="true" />
            )}
            {rule.max === 1 ? `Add ${label}` : "Add photos"}
          </Button>
          <p className="text-muted-foreground mt-1.5 text-xs">
            {salesFileHint(role)}
          </p>
        </div>
      ) : null}
    </div>
  );
}

/** "Remove {file}?" before a file goes for everyone. */
export function RemoveSalesFileDialog({
  documentType,
  documentId,
  file,
  onClose,
}: {
  documentType: SalesDocumentType;
  documentId: string;
  file: Pick<SalesDocumentFile, "id" | "fileName"> | null;
  onClose: () => void;
}) {
  const removal = useRemoveSalesFile(documentType, documentId);
  const [last, setLast] = useState(file);
  if (file != null && file !== last) setLast(file);
  const shown = file ?? last;
  return (
    <AlertDialog
      open={file != null}
      onOpenChange={(open) => {
        if (!open) {
          removal.reset();
          onClose();
        }
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="break-all">
            Remove {shown?.fileName}?
          </AlertDialogTitle>
          <AlertDialogDescription>
            It&apos;s removed for everyone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        {removal.isError ? (
          <FormAlert
            message={uploadErrorMessage(
              removal.error,
              "Couldn't remove. Try again.",
            )}
          />
        ) : null}
        <AlertDialogFooter>
          <AlertDialogCancel>Keep it</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={removal.isPending}
            onClick={() => {
              if (file == null) return;
              removal.mutate(file.id, {
                onSuccess: () => {
                  removal.reset();
                  onClose();
                },
              });
            }}
          >
            Remove
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
