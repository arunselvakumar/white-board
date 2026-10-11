"use client";

import { useState } from "react";
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

import { FormAlert } from "@/components/auth/form-alert";
import { downloadUrl } from "@/components/projects/files/file-viewer";
import { formatBytes } from "@/lib/project-documents";
import { uploadErrorMessage } from "@/src/queries/direct-upload";
import {
  useRemoveFinanceFile,
  type FinanceDocumentFile,
} from "@/src/queries/finance-documents";
import type { FinanceDocumentType } from "@/src/finance/domain/finance-documents";

/** A saved file as `FileThumbnail` and `FileViewer` take it. */
export function financeViewable(file: FinanceDocumentFile) {
  return {
    name: file.fileName,
    url: file.url,
    contentType: file.contentType,
    thumbUrl: file.thumbUrl,
  };
}

/** Where opening a file goes: shown when the browser can, else downloaded. */
export function financeOpenHref(file: FinanceDocumentFile): string {
  return file.viewable ? file.url : downloadUrl(file);
}

/** "420 KB · Karthik R" under a file. */
export function financeFileLine(file: FinanceDocumentFile): string {
  return `${formatBytes(file.bytes)}${file.createdByName == null ? "" : ` · ${file.createdByName}`}`;
}

/**
 * The files section's default heading: "Photos & receipts" on a
 * petty-cash voucher, "Files" on every other finance document.
 */
export function financeFilesHeading(type: FinanceDocumentType): string {
  return type === "petty_cash_voucher" ? "Photos & receipts" : "Files";
}

/**
 * "Remove {file}?" before a document's file goes for everyone. Closes on
 * success; a failure stays in the dialog with the server's message.
 */
export function RemoveFinanceFileDialog({
  documentType,
  documentId,
  file,
  onClose,
}: {
  documentType: FinanceDocumentType;
  documentId: string;
  /** The file to remove; null keeps the dialog closed. */
  file: Pick<FinanceDocumentFile, "id" | "fileName"> | null;
  onClose: () => void;
}) {
  const removal = useRemoveFinanceFile(documentType, documentId);
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
