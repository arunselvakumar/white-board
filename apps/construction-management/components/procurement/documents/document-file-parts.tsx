"use client";

import { RotateCw, X } from "lucide-react";
import { useState, type ReactNode } from "react";
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
import {
  Attachment,
  AttachmentAction,
  AttachmentActions,
  AttachmentContent,
  AttachmentDescription,
  AttachmentMedia,
  AttachmentTitle,
  AttachmentTrigger,
} from "@repo/ui/components/attachment";
import { cn } from "@repo/ui/lib/utils";

import { FormAlert } from "@/components/auth/form-alert";
import { DocumentFileIcon } from "@/components/projects/documents/document-file-icon";
import { FileThumbnail } from "@/components/projects/files/file-thumbnail";
import { downloadUrl } from "@/components/projects/files/file-viewer";
import type { ProcurementDocumentType } from "@/src/procurement/domain/documents";
import { uploadErrorMessage } from "@/src/queries/direct-upload";
import {
  useRemoveDocumentFile,
  type DocumentFile,
} from "@/src/queries/procurement-documents";

/** A saved file as `FileThumbnail` and `FileViewer` take it. */
export function viewable(file: DocumentFile) {
  return {
    name: file.fileName,
    url: file.url,
    contentType: file.contentType,
    thumbUrl: file.thumbUrl,
  };
}

/** Where opening a file goes: shown when the browser can, else downloaded. */
export function openHref(file: DocumentFile): string {
  return file.viewable ? file.url : downloadUrl(file);
}

/**
 * One file as a small chip (a comment's files, the composer's uploads):
 * its thumbnail or type icon, name and a line under it; opens on click
 * when saved; × removes, cancels or dismisses.
 */
export function FileChip({
  fileName,
  contentType,
  file,
  description,
  state,
  onOpen,
  remove,
  retry,
}: {
  fileName: string;
  contentType?: string;
  /** The saved file, for its thumbnail. */
  file?: DocumentFile;
  description: ReactNode;
  state: "uploading" | "error" | "done";
  onOpen?: () => void;
  remove?: { label: string; onClick: () => void; disabled?: boolean };
  retry?: () => void;
}) {
  return (
    <li className="max-w-full min-w-0">
      <Attachment
        size="xs"
        state={state}
        title={fileName}
        className="max-w-64 min-w-0 pr-1"
      >
        <AttachmentMedia variant={file == null ? "icon" : "image"}>
          {file == null ? (
            <DocumentFileIcon fileName={fileName} contentType={contentType} />
          ) : (
            <FileThumbnail file={viewable(file)} className="size-full" />
          )}
        </AttachmentMedia>
        <AttachmentContent>
          <AttachmentTitle>{fileName}</AttachmentTitle>
          <AttachmentDescription
            className={cn(state === "error" && "whitespace-normal")}
          >
            {description}
          </AttachmentDescription>
        </AttachmentContent>
        {onOpen == null ? null : (
          <AttachmentTrigger
            render={
              <button
                type="button"
                aria-label={`Open ${fileName}`}
                onClick={onOpen}
              />
            }
          />
        )}
        {retry == null && remove == null ? null : (
          <AttachmentActions>
            {retry == null ? null : (
              <AttachmentAction
                aria-label={`Retry ${fileName}`}
                onClick={retry}
              >
                <RotateCw />
              </AttachmentAction>
            )}
            {remove == null ? null : (
              <AttachmentAction
                aria-label={remove.label}
                disabled={remove.disabled}
                onClick={remove.onClick}
              >
                <X />
              </AttachmentAction>
            )}
          </AttachmentActions>
        )}
      </Attachment>
    </li>
  );
}

/**
 * "Remove {file}?" before a document's file goes for everyone. Closes on
 * success; a failure stays in the dialog with the server's message.
 */
export function RemoveFileDialog({
  documentType,
  documentId,
  file,
  onClose,
}: {
  documentType: ProcurementDocumentType;
  documentId: string;
  /** The file to remove; null keeps the dialog closed. */
  file: Pick<DocumentFile, "id" | "fileName"> | null;
  onClose: () => void;
}) {
  const removal = useRemoveDocumentFile(documentType, documentId);
  // Keep the name on screen while the dialog animates closed.
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
            It&apos;s removed from this document for everyone.
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
