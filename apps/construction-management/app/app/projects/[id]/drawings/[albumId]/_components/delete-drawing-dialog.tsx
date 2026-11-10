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
import { fieldForCode } from "@/lib/server-errors";
import {
  useDeleteDrawing,
  type DrawingSummary,
} from "@/src/queries/project-drawings";

/**
 * "Delete {drawing}?" before a drawing and all its revisions go for
 * everyone. Closes on success; a failure stays with the server's message.
 */
export function DeleteDrawingDialog({
  projectId,
  drawing,
  onClose,
}: {
  projectId: string;
  /** The drawing to delete; null keeps the dialog closed. */
  drawing: Pick<DrawingSummary, "id" | "name"> | null;
  onClose: () => void;
}) {
  const removal = useDeleteDrawing(projectId);
  // Keep the name on screen while the dialog animates closed.
  const [last, setLast] = useState(drawing);
  if (drawing != null && drawing !== last) setLast(drawing);
  const shown = drawing ?? last;
  return (
    <AlertDialog
      open={drawing != null}
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
            Delete {shown?.name}?
          </AlertDialogTitle>
          <AlertDialogDescription>
            Deletes the drawing and all its revisions, for everyone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        {removal.isError ? (
          <FormAlert message={fieldForCode(removal.error, {}).message} />
        ) : null}
        <AlertDialogFooter>
          <AlertDialogCancel>Keep it</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={removal.isPending}
            onClick={() => {
              if (drawing == null) return;
              removal.mutate(drawing.id, {
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
