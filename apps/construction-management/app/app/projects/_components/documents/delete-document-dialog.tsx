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
import {
  uploadErrorMessage,
  useDeleteProjectDocument,
  type ProjectDocument,
} from "@/src/queries/project-documents";

/**
 * "Delete {file}?" before a Project Document goes for everyone. Closes on
 * success; a failure stays in the dialog with the server's message.
 */
export function DeleteDocumentDialog({
  projectId,
  document,
  onClose,
}: {
  projectId: string;
  /** The file to delete; null keeps the dialog closed. */
  document: Pick<ProjectDocument, "id" | "fileName"> | null;
  onClose: () => void;
}) {
  const removal = useDeleteProjectDocument(projectId);
  // Keep the name on screen while the dialog animates closed.
  const [last, setLast] = useState(document);
  if (document != null && document !== last) setLast(document);
  const shown = document ?? last;
  return (
    <AlertDialog
      open={document != null}
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
            Delete {shown?.fileName}?
          </AlertDialogTitle>
          <AlertDialogDescription>
            It&apos;s removed from the Project for everyone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        {removal.isError ? (
          <FormAlert
            message={uploadErrorMessage(
              removal.error,
              "Couldn't delete. Try again.",
            )}
          />
        ) : null}
        <AlertDialogFooter>
          <AlertDialogCancel>Keep it</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={removal.isPending}
            onClick={() => {
              if (document == null) return;
              removal.mutate(document.id, {
                onSuccess: () => {
                  removal.reset();
                  onClose();
                },
              });
            }}
          >
            {removal.isPending ? "Deleting…" : "Delete"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
