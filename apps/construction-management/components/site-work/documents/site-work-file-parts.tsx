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
  takesImagesOnly,
  useRemoveSiteWorkFile,
  type SiteWorkDocumentFile,
} from "@/src/queries/site-work-documents";
import type { SiteWorkDocumentType } from "@/src/site-work/domain/site-work-documents";

/** A saved file as `FileThumbnail` and `FileViewer` take it. */
export function siteWorkViewable(file: SiteWorkDocumentFile) {
  return {
    name: file.fileName,
    url: file.url,
    contentType: file.contentType,
    thumbUrl: file.thumbUrl,
  };
}

/** Where opening a file goes: shown when the browser can, else downloaded. */
export function siteWorkOpenHref(file: SiteWorkDocumentFile): string {
  return file.viewable ? file.url : downloadUrl(file);
}

/** "420 KB · Karthik R" under a file. */
export function siteWorkFileLine(file: SiteWorkDocumentFile): string {
  return `${formatBytes(file.bytes)}${file.createdByName == null ? "" : ` · ${file.createdByName}`}`;
}

/**
 * The files section's default heading: "Work Photos" on a worksheet,
 * "Photos" on a Site Diary, "Files" on a usage sheet or hindrance.
 */
export function siteWorkFilesHeading(type: SiteWorkDocumentType): string {
  if (type === "worksheet") return "Work Photos";
  return takesImagesOnly(type) ? "Photos" : "Files";
}

/** "photo" or "file", as the document takes them. */
export function siteWorkFileNoun(type: SiteWorkDocumentType): string {
  return takesImagesOnly(type) ? "photo" : "file";
}

/**
 * "Remove {file}?" before a document's file goes for everyone. Closes on
 * success; a failure stays in the dialog with the server's message.
 */
export function RemoveSiteWorkFileDialog({
  documentType,
  documentId,
  file,
  onClose,
}: {
  documentType: SiteWorkDocumentType;
  documentId: string;
  /** The file to remove; null keeps the dialog closed. */
  file: Pick<SiteWorkDocumentFile, "id" | "fileName"> | null;
  onClose: () => void;
}) {
  const removal = useRemoveSiteWorkFile(documentType, documentId);
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
